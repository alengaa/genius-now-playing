import { gmGet, gmSet, gmDel } from './storage.js';

// Spotify API constants
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

// Helper functions
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
	const hash = await crypto.subtle.digest('SHA-256', data);
	return hash;
}

// Spotify OAuth flow
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

// Handle redirect after Spotify login
export async function handleRedirectIfNeeded() {
	const url = new URL(window.location.href);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code || !state) return false;

	const savedState = await gmGet(K.state);
	if (state !== savedState) {
		alert('Spotify login failed: state mismatch.');
		return false;
	}

	const codeVerifier = await gmGet(K.verifier);
	if (!codeVerifier) {
		alert('Spotify login failed: missing code verifier.');
		return false;
	}

	// Exchange code for tokens
	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		grant_type: 'authorization_code',
		code: code,
		redirect_uri: REDIRECT_URI,
		code_verifier: codeVerifier,
	});

	const res = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params,
	});

	if (!res.ok) {
		alert('Spotify login failed: token exchange error.');
		return false;
	}

	const data = await res.json();
	await gmSet(K.access, data.access_token);
	await gmSet(K.refresh, data.refresh_token);
	await gmSet(K.expiry, Date.now() + (data.expires_in - 60) * 1000);

	// Clean up URL
	window.history.replaceState({}, document.title, url.pathname);

	return true;
}

// Refresh access token if needed
export async function refreshTokenIfNeeded() {
	const expiry = await gmGet(K.expiry, 0);
	const now = Date.now();
	if (now < expiry) return; // Token still valid

	const refreshToken = await gmGet(K.refresh);
	if (!refreshToken) throw new Error('No refresh token available.');

	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		grant_type: 'refresh_token',
		refresh_token: refreshToken,
	});

	const res = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params,
	});

	if (!res.ok) throw new Error('Failed to refresh Spotify token.');

	const data = await res.json();
	await gmSet(K.access, data.access_token);
	if (data.refresh_token) await gmSet(K.refresh, data.refresh_token);
	await gmSet(K.expiry, Date.now() + (data.expires_in - 60) * 1000);
}

// Get currently playing track from Spotify
export async function getCurrentlyPlaying() {
	await refreshTokenIfNeeded();
	const accessToken = await gmGet(K.access);
	if (!accessToken) throw new Error('No Spotify access token.');

	const res = await fetch(
		'https://api.spotify.com/v1/me/player/currently-playing',
		{
			headers: { Authorization: `Bearer ${accessToken}` },
		},
	);

	if (res.status === 204) return null; // Nothing playing
	if (!res.ok) throw new Error('Failed to fetch currently playing track.');

	const data = await res.json();
	if (!data || !data.item) return null;

	return {
		title: data.item.name,
		artist: data.item.artists.map((a) => a.name).join(', '),
		artUrl: data.item.album.images[0]?.url || '',
	};
}

// Logout and clear tokens
export async function logout() {
	await gmDel(K.access);
	await gmDel(K.refresh);
	await gmDel(K.expiry);
	await gmDel(K.verifier);
	await gmDel(K.state);
}
