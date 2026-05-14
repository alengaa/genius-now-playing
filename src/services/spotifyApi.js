import { gmGet, gmSet, gmDel } from './storage.js';

export const CLIENT_ID = '8e07d86dd04241ce98f3c959c6b0beec';
export const SCOPES = 'user-read-currently-playing';
export const REDIRECT_URI = 'https://genius.com/';
export const K = {
	verifier: 'sp_code_verifier',
	state: 'sp_state',
	access: 'sp_access_token',
	refresh: 'sp_refresh_token',
	expiry: 'sp_token_expiry',
};

function randStr(len) {
	const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let o = '';
	for (let i = 0; i < len; i++) o += c[Math.floor(Math.random() * c.length)];
	return o;
}

function base64url(buf) {
	return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

async function sha256(input) {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	return await crypto.subtle.digest('SHA-256', data);
}

export async function startLogin() {
	const codeVerifier = randStr(64);
	const codeChallenge = base64url(await sha256(codeVerifier));
	const state = randStr(16);
	await gmSet(K.verifier, codeVerifier);
	await gmSet(K.state, state);

	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		response_type: 'code',
		redirect_uri: REDIRECT_URI,
		code_challenge_method: 'S256',
		code_challenge: codeChallenge,
		state: state,
		scope: SCOPES,
	});

	window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function handleRedirectIfNeeded() {
	const url = new URL(window.location.href);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code || !state) return false;

	const savedState = await gmGet(K.state);
	if (state !== savedState) {
		console.error('State mismatch!');
		return false;
	}

	const codeVerifier = await gmGet(K.verifier);
	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		grant_type: 'authorization_code',
		code: code,
		redirect_uri: REDIRECT_URI,
		code_verifier: codeVerifier,
	});

	const res = await browser.runtime.sendMessage({
		type: 'spotifyApiFetch',
		url: 'https://accounts.spotify.com/api/token',
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params.toString(),
	});

	if (res.ok) {
		await gmSet(K.access, res.data.access_token);
		await gmSet(K.refresh, res.data.refresh_token);
		await gmSet(K.expiry, Date.now() + (res.data.expires_in - 60) * 1000);
		window.history.replaceState({}, document.title, url.pathname);
		return true;
	}
	return false;
}

export async function refreshTokenIfNeeded() {
	const expiry = await gmGet(K.expiry, 0);
	if (Date.now() < expiry) return;
	const refreshToken = await gmGet(K.refresh);
	if (!refreshToken) return;

	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		grant_type: 'refresh_token',
		refresh_token: refreshToken,
	});

	const res = await browser.runtime.sendMessage({
		type: 'spotifyApiFetch',
		url: 'https://accounts.spotify.com/api/token',
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params.toString(),
	});

	if (res.ok) {
		await gmSet(K.access, res.data.access_token);
		if (res.data.refresh_token)
			await gmSet(K.refresh, res.data.refresh_token);
		await gmSet(K.expiry, Date.now() + (res.data.expires_in - 60) * 1000);
	}
}

export async function getUserProfile() {
	try {
		await refreshTokenIfNeeded();
		const accessToken = await gmGet(K.access);
		if (!accessToken) return null;
		const res = await browser.runtime.sendMessage({
			type: 'spotifyApiFetch',
			url: 'https://api.spotify.com/v1/me',
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		return res.ok ? res.data : null;
	} catch (e) {
		return null;
	}
}

export async function getCurrentlyPlaying() {
	try {
		await refreshTokenIfNeeded();
		const accessToken = await gmGet(K.access);
		if (!accessToken) return null;
		const res = await browser.runtime.sendMessage({
			type: 'spotifyApiFetch',
			url: 'https://api.spotify.com/v1/me/player/currently-playing',
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		// LOG RAW DATA HERE
		console.log('Spotify Raw Data:', res.data);

		if (res.status === 204 || !res.data || !res.data.item) return null;

		const item = res.data.item;
		const artists = item.artists.map((a) => a.name).join(', ');

		return {
			title: item.name,
			artist: artists,
			albumArtist: item.album.artists[0]?.name || '',
			artUrl: item.album.images[0]?.url || '',
		};
	} catch (e) {
		return null;
	}
}

export async function logout() {
	await gmDel(K.access);
	await gmDel(K.refresh);
	await gmDel(K.expiry);
	await gmDel(K.verifier);
	await gmDel(K.state);
}
