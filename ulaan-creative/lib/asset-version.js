// Changes with every deploy, so phones never pair new HTML with yesterday's cached CSS/JS
// (/assets/* is cached for a day — see vercel.json).
export const ASSET_V = encodeURIComponent(String(process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(36)).slice(-12));
