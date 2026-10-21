// PIM-37 will verify the IAP JWT carried by these headers; until then only the local DEV_AUTHOR exists.
export async function currentAuthor(headers: Headers): Promise<string | null> {
  void headers;
  const onCloudRun = Boolean(process.env.K_SERVICE);
  const iapEnabled = Boolean(process.env.IAP_AUDIENCE?.trim());
  if (onCloudRun || iapEnabled) {
    return null;
  }
  return process.env.DEV_AUTHOR?.trim() || null;
}
