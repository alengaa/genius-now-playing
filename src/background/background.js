browser.runtime.onMessage.addListener(async (msg, sender) => {
	// 1. GENIUS API FETCH
	if (msg.type === 'geniusApiFetch') {
		try {
			const res = await fetch(msg.url, {
				headers: msg.headers || {},
				method: msg.method || 'GET',
			});
			const text = await res.text();
			return { ok: res.ok, status: res.status, text };
		} catch (e) {
			return { ok: false, error: e.message };
		}
	}

	// 2. SPOTIFY API FETCH (New Proxy Logic)
	if (msg.type === 'spotifyApiFetch') {
		try {
			const res = await fetch(msg.url, {
				method: msg.method || 'GET',
				headers: msg.headers || {},
				body: msg.body || null,
			});

			// Spotify returns 204 No Content when nothing is playing
			if (res.status === 204)
				return { ok: true, status: 204, data: null };

			const data = await res.json();
			return { ok: res.ok, status: res.status, data };
		} catch (e) {
			return { ok: false, error: e.message };
		}
	}
});
