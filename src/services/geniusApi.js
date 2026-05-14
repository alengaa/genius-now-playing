export const GENIUS_API_KEY =
	'HWUJiEYJRqxfhMaTNDEDCh7IRindGZX37ATbBlB1rsgFFKpZFtESLLB1h2l_kdjj';
const geniusCache = new Map();

/**
 * Helper: Remove (feat. Artist), (ft. Artist), (Remaster), (Remastered), etc.
 */
function cleanSongTitle(title) {
	return title
		.replace(/\((feat\.|ft\.)[^\)]*\)/gi, '')
		.replace(/\(([^)]*remaster(ed)?[^)]*)\)/gi, '')
		.replace(/-\s*\d{0,4}\s*remaster(ed)?/gi, '')
		.replace(/\s*\bremaster(ed)?\b\s*$/gi, '')
		.trim();
}

/**
 * Normalize strings for comparison
 */
function normalize(str) {
	return str.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Split multiple artists and normalize
 */
function parseArtists(artistStr) {
	return artistStr.split(/[, &]+/).map((a) => normalize(a));
}

// ------------------ Main function ------------------
export async function fetchGeniusUrlAndCover(title, artist) {
	const cleanTitle = cleanSongTitle(title);
	const cacheKey = `${cleanTitle} ${artist}`.trim();

	if (geniusCache.has(cacheKey)) {
		return geniusCache.get(cacheKey);
	}

	const firstArtist = artist
		.split(',')[0]
		.replace(/[^a-zA-Z0-9\s]/g, '')
		.trim();

	const query = `${cleanTitle} ${firstArtist}`.trim();
	const apiUrl = `https://api.genius.com/search?q=${encodeURIComponent(query)}`;

	console.log(`${firstArtist} - ${cleanTitle}`);
	console.log('Query sent to Genius API:', apiUrl);

	const res = await browser.runtime.sendMessage({
		type: 'geniusApiFetch',
		url: apiUrl,
		headers: { Authorization: `Bearer ${GENIUS_API_KEY}` },
	});

	if (!res.ok) {
		console.log('Request failed:', res.status);
		return { url: null, cover: null };
	}

	let data;
	try {
		data = JSON.parse(res.text);
	} catch (e) {
		console.log('Failed to parse Genius API response:', e);
		return { url: null, cover: null };
	}

	console.log('Genius API Hits:', data.response?.hits || []);

	const songHits = (data.response?.hits || []).filter(
		(hit) => hit.type === 'song',
	);
	if (!songHits.length) return { url: null, cover: null };

	const scoredHits = songHits.map((hit) => {
		const hitArtists = parseArtists(hit.result.primary_artist?.name || '');
		const featMatch = hit.result.title_with_featured.match(
			/\((?:feat\.|ft\.) ([^)]+)\)/i,
		);
		if (featMatch) hitArtists.push(...parseArtists(featMatch[1]));

		const matchCount = hitArtists.filter((a) =>
			normalize(firstArtist).includes(a),
		).length;
		const titleExact =
			normalize(hit.result.title) === normalize(cleanTitle);

		return { hit, score: matchCount, titleExact };
	});

	scoredHits.sort((a, b) => b.titleExact - a.titleExact || b.score - a.score);
	const bestHit = scoredHits[0]?.hit;

	if (!bestHit) return { url: null, cover: null };

	const pageUrl = bestHit.result.url || null;
	const coverUrl =
		bestHit.result.song_art_image_url ||
		bestHit.result.header_image_url ||
		null;

	geniusCache.set(cacheKey, { url: pageUrl, cover: coverUrl });
	return { url: pageUrl, cover: coverUrl };
}

// ------------------ Extra exports for compatibility ------------------

/**
 * Fetch the artist's Genius page URL by name.
 */
export async function fetchArtistPageUrl(artistName) {
	const apiUrl = `https://api.genius.com/search?q=${encodeURIComponent(artistName)}`;
	const res = await fetch(apiUrl, {
		headers: { Authorization: `Bearer ${GENIUS_API_KEY}` },
	});

	if (!res.ok) return null;

	const data = await res.json();
	const firstHit = data.response?.hits?.[0];
	return firstHit?.result?.primary_artist?.url || null;
}

/**
 * Fetch the artist's avatar (image) from a Genius artist page URL.
 */
export async function fetchArtistAvatarFromGeniusPageUrl(url) {
	try {
		const res = await fetch(url);
		const html = await res.text();
		const match = html.match(/<meta property="og:image" content="([^"]+)"/);
		return match ? match[1] : null;
	} catch (e) {
		console.error('Error fetching artist avatar:', e);
		return null;
	}
}

/**
 * Simple debug logger used across scripts.
 */
export function debugLog(...args) {
	console.log('[GeniusAPI]', ...args);
}
