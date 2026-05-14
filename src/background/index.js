browser.runtime.onMessage.addListener(async (msg, sender) => {
	if (msg.type === 'geniusApiFetch') {
		try {
			console.log('[GeniusAPI Background] Fetching:', msg.url); // background console

			const res = await fetch(msg.url, {
				headers: msg.headers || {},
				method: msg.method || 'GET',
			});
			const text = await res.text();

			// Forward to the page that sent the message
			if (sender.tab?.id) {
				browser.tabs.sendMessage(sender.tab.id, {
					type: 'GENIUS_API_LOG',
					args: [
						'[GeniusAPI Background] Response OK:',
						res.ok,
						'Status:',
						res.status,
					],
				});
			}

			return { ok: res.ok, status: res.status, text };
		} catch (e) {
			console.error('[GeniusAPI Background] Fetch error', e);
			return { ok: false, status: 0, text: '' };
		}
	}
});
