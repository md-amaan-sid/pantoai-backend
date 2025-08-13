export function getProviderFromSession(req) {
  const providerName = req.session.provider;
  if (!providerName) throw new Error("No provider in session");
  return providerName;
}

export const renderBackendApiUrl = "https://gitmanagement-backend.onrender.com";
export const netlifyFrontendUrl = "https://gitmanagement.netlify.app/";
