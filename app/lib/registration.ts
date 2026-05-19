export const REGISTRATION_ENABLED_KEY = "REGISTRATION_ENABLED"

/**
 * 获取站点是否允许新用户注册。
 */
export async function getRegistrationEnabled(siteConfig: KVNamespace): Promise<boolean> {
  // 只有显式写入 "false" 才关闭注册，确保旧部署默认保持开放注册。
  return (await siteConfig.get(REGISTRATION_ENABLED_KEY)) !== "false"
}
