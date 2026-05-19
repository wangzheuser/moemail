"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff, RefreshCw, Settings } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useState, useEffect } from "react"
import { Role, ROLES } from "@/lib/permissions"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EMAIL_CONFIG } from "@/config"

type CloudflareDomainsResponse = {
  domains?: string[]
  error?: string
}

/**
 * 将逗号分隔的域名配置拆成规范列表。
 */
function parseDomainInput(value: string) {
  return value
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * 合并当前配置和 Cloudflare 返回结果，避免覆盖手动填写内容。
 */
function mergeDomains(currentValue: string, cloudflareDomains: string[]) {
  return Array.from(new Set([
    ...parseDomainInput(currentValue),
    ...cloudflareDomains.map((domain) => domain.trim().toLowerCase()).filter(Boolean),
  ])).join(", ")
}

export function WebsiteConfigPanel() {
  const t = useTranslations("profile.website")
  const tCard = useTranslations("profile.card")
  const [defaultRole, setDefaultRole] = useState<string>("")
  const [emailDomains, setEmailDomains] = useState<string>("")
  const [adminContact, setAdminContact] = useState<string>("")
  const [maxEmails, setMaxEmails] = useState<string>(EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString())
  const [registrationEnabled, setRegistrationEnabled] = useState(true)
  const [turnstileEnabled, setTurnstileEnabled] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("")
  const [turnstileSecretKey, setTurnstileSecretKey] = useState("")
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [syncingDomains, setSyncingDomains] = useState(false)
  const { toast } = useToast()


  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    const res = await fetch("/api/config")
    if (res.ok) {
      const data = await res.json() as { 
        defaultRole: Exclude<Role, typeof ROLES.EMPEROR>,
        emailDomains: string,
        adminContact: string,
        maxEmails: string,
        registrationEnabled?: boolean,
        turnstile?: {
          enabled: boolean,
          siteKey: string,
          secretKey?: string
        }
      }
      setDefaultRole(data.defaultRole)
      setEmailDomains(data.emailDomains)
      setAdminContact(data.adminContact)
      setMaxEmails(data.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString())
      setRegistrationEnabled(data.registrationEnabled ?? true)
      setTurnstileEnabled(Boolean(data.turnstile?.enabled))
      setTurnstileSiteKey(data.turnstile?.siteKey ?? "")
      setTurnstileSecretKey(data.turnstile?.secretKey ?? "")
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          defaultRole, 
          emailDomains,
          adminContact,
          maxEmails: maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString(),
          registrationEnabled,
          turnstile: {
            enabled: turnstileEnabled,
            siteKey: turnstileSiteKey,
            secretKey: turnstileSecretKey
          }
        }),
      })

      if (!res.ok) throw new Error(t("saveFailed"))

      toast({
        title: t("saveSuccess"),
        description: t("saveSuccess"),
      })
    } catch (error) {
      toast({
        title: t("saveFailed"),
        description: error instanceof Error ? error.message : t("saveFailed"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  /**
   * 从 Cloudflare 同步可用于收信的域名，只填入输入框，不自动保存配置。
   */
  const handleSyncCloudflareDomains = async () => {
    setSyncingDomains(true)
    try {
      const res = await fetch("/api/config/cloudflare-domains")
      const data = await res.json() as CloudflareDomainsResponse

      if (!res.ok) {
        throw new Error(data.error || t("syncCloudflareDomainsFailed"))
      }

      const domains = data.domains ?? []
      if (domains.length === 0) {
        toast({
          title: t("syncCloudflareDomainsEmpty"),
          description: t("syncCloudflareDomainsEmpty"),
        })
        return
      }

      // 同步结果先合并到表单，最终保存仍由管理员确认。
      setEmailDomains(mergeDomains(emailDomains, domains))
      toast({
        title: t("syncCloudflareDomainsSuccess"),
        description: t("syncCloudflareDomainsSuccess"),
      })
    } catch (error) {
      toast({
        title: t("syncCloudflareDomainsFailed"),
        description: error instanceof Error ? error.message : t("syncCloudflareDomainsFailed"),
        variant: "destructive",
      })
    } finally {
      setSyncingDomains(false)
    }
  }

  return (
    <div className="bg-background rounded-lg border-2 border-primary/20 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-sm">{t("defaultRole")}:</span>
          <Select value={defaultRole} onValueChange={setDefaultRole}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROLES.DUKE}>{tCard("roles.DUKE")}</SelectItem>
              <SelectItem value={ROLES.KNIGHT}>{tCard("roles.KNIGHT")}</SelectItem>
              <SelectItem value={ROLES.CIVILIAN}>{tCard("roles.CIVILIAN")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">{t("emailDomains")}:</span>
          <div className="flex-1">
            <div className="flex gap-2">
              <Input 
                value={emailDomains}
                onChange={(e) => setEmailDomains(e.target.value)}
                placeholder={t("emailDomainsPlaceholder")}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSyncCloudflareDomains}
                disabled={syncingDomains || loading}
                className="shrink-0"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${syncingDomains ? "animate-spin" : ""}`} />
                {syncingDomains ? t("syncingCloudflareDomains") : t("syncCloudflareDomains")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">{t("adminContact")}:</span>
          <div className="flex-1">
            <Input 
              value={adminContact}
              onChange={(e) => setAdminContact(e.target.value)}
              placeholder={t("adminContactPlaceholder")}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">{t("maxEmails")}:</span>
          <div className="flex-1">
            <Input 
              type="number"
              min="1"
              max="100"
              value={maxEmails}
              onChange={(e) => setMaxEmails(e.target.value)}
              placeholder={`${EMAIL_CONFIG.MAX_ACTIVE_EMAILS}`}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-dashed border-primary/40 p-4">
          <div className="space-y-1">
            <Label htmlFor="registration-enabled" className="text-sm font-medium">
              {t("registration.enable")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("registration.enableDescription")}
            </p>
          </div>
          <Switch
            id="registration-enabled"
            checked={registrationEnabled}
            onCheckedChange={setRegistrationEnabled}
          />
        </div>

        <div className="space-y-4 rounded-lg border border-dashed border-primary/40 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="turnstile-enabled" className="text-sm font-medium">
                {t("turnstile.enable")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("turnstile.enableDescription")}
              </p>
            </div>
            <Switch
              id="turnstile-enabled"
              checked={turnstileEnabled}
              onCheckedChange={setTurnstileEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="turnstile-site-key" className="text-sm font-medium">
              {t("turnstile.siteKey")}
            </Label>
            <Input
              id="turnstile-site-key"
              value={turnstileSiteKey}
              onChange={(e) => setTurnstileSiteKey(e.target.value)}
              placeholder={t("turnstile.siteKeyPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="turnstile-secret-key" className="text-sm font-medium">
              {t("turnstile.secretKey")}
            </Label>
            <div className="relative">
              <Input
                id="turnstile-secret-key"
                type={showSecretKey ? "text" : "password"}
                value={turnstileSecretKey}
                onChange={(e) => setTurnstileSecretKey(e.target.value)}
                placeholder={t("turnstile.secretKeyPlaceholder")}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowSecretKey((prev) => !prev)}
              >
                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("turnstile.secretKeyDescription")}
            </p>
          </div>
        </div>

        <Button 
          onClick={handleSave}
          disabled={loading}
          className="w-full"
        >
          {t("save")}
        </Button>
      </div>
    </div>
  )
} 
