export default function getProviderFromSession(req) {
  const providerName = req.session.provider;
  if (!providerName) throw new Error("No provider in session");
  return providerName;
}
