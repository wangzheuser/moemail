import { PERMISSIONS } from "@/lib/permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { checkPermission } from "@/lib/auth"

export const runtime = "edge"

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"
const MAX_ZONE_PAGE_SIZE = 50

type CloudflareApiError = {
  code?: number
  message?: string
}

type CloudflareListResponse<T> = {
  success: boolean
  result?: T[]
  result_info?: {
    page?: number
    total_pages?: number
  }
  errors?: CloudflareApiError[]
}

type CloudflareSingleResponse<T> = {
  success: boolean
  result?: T
  errors?: CloudflareApiError[]
}

type CloudflareZone = {
  id: string
  name: string
  status?: string
}

type EmailRoutingSettings = {
  enabled?: boolean
  status?: string
}

/**
 * 读取 Cloudflare API 错误信息，便于前端展示明确原因。
 */
function getCloudflareErrorMessage(errors?: CloudflareApiError[]) {
  return errors?.map((error) => error.message).filter(Boolean).join("; ") || "Cloudflare API 调用失败"
}

/**
 * 调用 Cloudflare API，并统一处理鉴权头与错误响应。
 */
async function fetchCloudflare<T extends { success: boolean; errors?: CloudflareApiError[] }>(
  path: string,
  apiToken: string
): Promise<T> {
  const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  })

  const data = await response.json<T>()

  if (!response.ok || !data.success) {
    throw new Error(getCloudflareErrorMessage(data.errors))
  }

  return data as T
}

/**
 * 分页读取账号下已激活的 Zone，避免只拿到第一页数据。
 */
async function listActiveZones(apiToken: string, accountId: string) {
  const zones: CloudflareZone[] = []
  let page = 1
  let totalPages = 1

  do {
    const params = new URLSearchParams({
      "account.id": accountId,
      status: "active",
      page: page.toString(),
      per_page: MAX_ZONE_PAGE_SIZE.toString(),
    })

    const data = await fetchCloudflare<CloudflareListResponse<CloudflareZone>>(`/zones?${params.toString()}`, apiToken)
    zones.push(...(data.result ?? []))

    // 按 Cloudflare 分页信息继续读取下一页。
    totalPages = data.result_info?.total_pages ?? page
    page += 1
  } while (page <= totalPages)

  return zones
}

/**
 * 判断指定 Zone 的 Email Routing 是否已经可用于收信。
 */
async function isEmailRoutingReady(apiToken: string, zoneId: string) {
  const data = await fetchCloudflare<CloudflareSingleResponse<EmailRoutingSettings>>(
    `/zones/${zoneId}/email/routing`,
    apiToken
  )

  return data.result?.enabled === true && data.result.status === "ready"
}

/**
 * 同步 Cloudflare 中已启用 Email Routing 的邮箱域名。
 */
export async function GET() {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return Response.json({ error: "权限不足" }, { status: 403 })
  }

  const env = getRequestContext().env
  const apiToken = env.CLOUDFLARE_API_TOKEN
  const accountId = env.CLOUDFLARE_ACCOUNT_ID

  if (!apiToken || !accountId) {
    return Response.json({ error: "未配置 Cloudflare API Token 或 Account ID" }, { status: 400 })
  }

  try {
    const zones = await listActiveZones(apiToken, accountId)
    const checks = await Promise.all(
      zones.map(async (zone) => ({
        domain: zone.name,
        ready: await isEmailRoutingReady(apiToken, zone.id),
      }))
    )

    const domains = checks
      .filter((item) => item.ready)
      .map((item) => item.domain)
      .sort((left, right) => left.localeCompare(right))

    return Response.json({ domains })
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "同步 Cloudflare 邮箱域名失败",
    }, { status: 502 })
  }
}
