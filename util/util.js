function getProviderFromSession(req) {
  const providerName = req.session.provider;
  if (!providerName) throw new Error("No provider in session");
  return providerName;
}

const renderBackendApiUrl = "https://gitmanagement-backend.onrender.com";
const netlifyFrontendUrl = "https://gitmanagement.netlify.app/";

export default {
  getProviderFromSession,
  renderBackendApiUrl,
  netlifyFrontendUrl,
};
