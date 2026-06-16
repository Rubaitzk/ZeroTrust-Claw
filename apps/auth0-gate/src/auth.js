const getAdminRoleClaim = () => process.env.AUTH0_ROLE_CLAIM || 'https://example.com/roles';

const hasAdminRole = (user) => {
  const claim = getAdminRoleClaim();
  const roles = user?.[claim];
  if (!roles) return false;
  if (Array.isArray(roles)) return roles.includes('Admin');
  return `${roles}`.split(',').map((role) => role.trim()).includes('Admin');
};

const buildApprovalUrl = (baseUrl, transactionId) => {
  return `${baseUrl.replace(/\/$/, '')}/approval/authorize/${transactionId}`;
};

module.exports = {
  getAdminRoleClaim,
  hasAdminRole,
  buildApprovalUrl,
};
