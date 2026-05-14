export const GENIUS_API_KEY =
	'HWUJiEYJRqxfhMaTNDEDCh7IRindGZX37ATbBlB1rsgFFKpZFtESLLB1h2l_kdjj';
const geniusCache = new Map();

// --- DEBUG TOGGLE ---
const DEBUG_MODE = true;

function cleanSongTitle(title) {
	return title
		.replace(/\((feat\.|ft\.)[^\)]*\)/gi, '')
		.replace(
			/\((Instrumental)\)|\[(Instrumental)\]|Instrumental Remake/gi,
			'',
		)
		.trim();
}

function normalize(str) {
	return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function fetchSongDetails(songId) {
	const res = await browser.runtime.sendMessage({
		type: 'geniusApiFetch',
		url: `https://api.genius.com/songs/${songId}`,
		headers: { Authorization: `Bearer ${GENIUS_API_KEY}` },
	});
	return res.ok ? JSON.parse(res.text).response.song : null;
}

export async function fetchGeniusUrlAndCover(title, artist) {
	const instrumentalRegex =
		/\((Instrumental)\)|\[(Instrumental)\]|Instrumental Remake/i;
	const isInstrumental = instrumentalRegex.test(title);
	const cleanTitle = cleanSongTitle(title);
	const cacheKey = `${cleanTitle}-${artist}`;

	if (geniusCache.has(cacheKey)) return geniusCache.get(cacheKey);

	const query = isInstrumental ? cleanTitle : `${cleanTitle} ${artist}`;
	const targetTitle = normalize(cleanTitle);
	const targetArtist = normalize(artist);

	const startTime = Date.now();
	const TIMEOUT_MS = 5000;
	let currentPage = 1;
	let foundResult = null;

	if (DEBUG_MODE) console.log(`[Genius] Searching: "${query}"`);

	while (Date.now() - startTime < TIMEOUT_MS) {
		const resultsPerPage = currentPage === 1 ? 10 : 50;
		const apiUrl = `https://api.genius.com/search?q=${encodeURIComponent(query)}&per_page=${resultsPerPage}&page=${currentPage}`;

		const res = await browser.runtime.sendMessage({
			type: 'geniusApiFetch',
			url: apiUrl,
			headers: { Authorization: `Bearer ${GENIUS_API_KEY}` },
		});

		if (!res.ok) break;
		const data = JSON.parse(res.text);
		const hits = data.response?.hits || [];
		if (hits.length === 0) break;

		if (DEBUG_MODE) console.log(`[Genius] Page ${currentPage} checking...`);

		for (const hit of hits) {
			if (Date.now() - startTime >= TIMEOUT_MS) break;
			if (hit.type !== 'song') continue;

			if (isInstrumental) {
				if (normalize(hit.result.title) !== targetTitle) continue;
				const song = await fetchSongDetails(hit.result.id);
				if (!song) continue;

				const hasMatch =
					song.producer_artists.some((p) =>
						normalize(p.name).includes(targetArtist),
					) ||
					normalize(song.primary_artist.name).includes(targetArtist);
				if (hasMatch) {
					foundResult = finalize(cacheKey, song);
					break;
				}
			} else {
				if (
					normalize(hit.result.primary_artist.name).includes(
						targetArtist,
					)
				) {
					foundResult = finalize(cacheKey, hit.result);
					break;
				}
			}
		}
		if (foundResult) return foundResult;
		currentPage++;
	}
	return { url: null, cover: null };
}

function finalize(key, result) {
	const data = {
		url: result.url,
		cover: result.song_art_image_url || result.header_image_url,
	};
	geniusCache.set(key, data);
	return data;
}

export async function fetchArtistPageUrl(artistName) {
	const res = await fetch(
		`https://api.genius.com/search?q=${encodeURIComponent(artistName)}`,
		{ headers: { Authorization: `Bearer ${GENIUS_API_KEY}` } },
	);
	if (!res.ok) return null;
	const data = await res.json();
	return data.response?.hits?.[0]?.result?.primary_artist?.url || null;
}

export async function fetchArtistAvatarFromGeniusPageUrl(url) {
	try {
		const res = await fetch(url);
		const match = (await res.text()).match(
			/<meta property="og:image" content="([^"]+)"/,
		);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}
