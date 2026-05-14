// Get a value from browser.storage.local, or return default if not found
export const gmGet = async (k, d = null) => {
	const r = await browser.storage.local.get(k);
	return r && k in r ? r[k] : d;
};

// Set a value in browser.storage.local
export const gmSet = async (k, v) => {
	await browser.storage.local.set({ [k]: v });
};

// Remove a value from browser.storage.local
export const gmDel = async (k) => {
	await browser.storage.local.remove(k);
};
