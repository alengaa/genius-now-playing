console.log('Genius Spotify Now Playing content script loaded');

import {
	fetchGeniusUrlAndCover,
	fetchArtistPageUrl,
	fetchArtistAvatarFromGeniusPageUrl,
	debugLog,
} from './services/geniusApi.js';
import { gmGet, gmSet, gmDel } from './storage.js';
import {
	startLogin,
	handleRedirectIfNeeded,
	getCurrentlyPlaying,
	logout,
} from './spotifyApi.js';

// ---------------------- Helper functions ----------------------
function cleanTitleForSearch(title) {
	if (!title) return '';
	return title
		.replace(/\((feat\.|ft\.).*?\)/gi, '')
		.replace(/\((.*?)\)/g, '$1')
		.trim();
}

// ---------------------- Widget Styling ----------------------
function addStyle() {
	const style = document.createElement('style');
	style.textContent = `
html{overflow-y:scroll;}
#spotify-now-playing,#spotify-now-playing *{font-family:"Programme",sans-serif!important;color:#fff;}
#spotify-now-playing{position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;gap:8px;padding:10px 14px;padding-right:24px;background:#0f111a;border-top:1px solid #222;z-index:999999;}
#spotify-now-playing img{height:50px;width:50px;object-fit:cover;box-shadow:0 0 5px rgba(255,255,255,0.25);}
#spotify-now-playing .meta{flex:1;min-width:0;}
#spotify-now-playing .title{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#spotify-now-playing .artist{color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.status{color:#ff4d4d;font-size:12px;margin-top:2px;}
#spotify-now-playing button{font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;border:2.5px solid transparent;border-radius:0;display:inline-flex;align-items:center;justify-content:center;padding:6px 14px;}
#spotify-now-playing button.search-btn{background-color:#ffff64;color:#0f111a;border-color:#ffff64;padding:6px;height:32px;aspect-ratio:1/1;}
#spotify-now-playing button.search-btn:hover{background-color:#fff;border-color:#fff;color:#0f111a;}
#spotify-now-playing button.yellow-btn{background-color:#ffff64;color:#0f111a;border-color:#ffff64;}
#spotify-now-playing button.yellow-btn:hover{background-color:#fff;border-color:#fff;color:#0f111a;}
#spotify-now-playing button.green-btn{background-color:#1db954;color:#0f111a;border-color:#1db954;}
#spotify-now-playing button.green-btn:hover{background-color:#fff;border-color:#fff;color:#0f111a;}
.cover-wrap{display:flex;align-items:flex-end;gap:6px;height:50px;}
.audio-bars{display:flex;align-items:flex-end;justify-content:space-between;height:35%;width:16px;margin-right:.5px;animation:speedCycle 6s ease-in-out infinite;transform-origin:bottom center;}
.audio-bars span{display:block;width:4.5px;height:100%;background:#1db954;border:0.75px solid #000;border-top-left-radius:12px;border-top-right-radius:12px;transform-origin:bottom center;will-change:transform;backface-visibility:hidden;}
.audio-bars span:nth-child(1){animation:barPulse1 1.2s ease-in-out infinite;}
.audio-bars span:nth-child(2){animation:barPulse2 1.35s ease-in-out infinite;}
.audio-bars span:nth-child(3){animation:barPulse3 1.05s ease-in-out infinite;}
@keyframes barPulse1{0%,100%{transform:scaleY(0.3);}50%{transform:scaleY(1);}}
@keyframes barPulse2{0%,100%{transform:scaleY(0.25);}50%{transform:scaleY(0.9);}}
@keyframes barPulse3{0%,100%{transform:scaleY(0.35);}50%{transform:scaleY(0.8);}}
@keyframes speedCycle{0%,30%{transform:scaleY(1);}30%,80%{transform:scaleY(1.3);}100%{transform:scaleY(1);}}
.paused .audio-bars span{animation-play-state:paused;transform:scaleY(0.35);}
  `;
	document.head.appendChild(style);
}

// ---------------------- Widget Creation ----------------------
function createWidget() {
	let el = document.getElementById('spotify-now-playing');
	if (!el) {
		el = document.createElement('div');
		el.id = 'spotify-now-playing';
		el.innerHTML = `
      <div class="cover-wrap">
        <div class="audio-bars" id="sp-bars"><span></span><span></span><span></span></div>
        <img id="sp-cover" src="" alt="">
      </div>
      <div class="meta">
        <div class="title" id="sp-title"></div>
        <div class="artist" id="sp-artist"></div>
      </div>
      <button id="sp-search" class="search-btn" title="Search manually">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" width="16" height="16">
          <path d="M15.5 14h-.79l-.28-.27a6.471 6.471 0 001.48-5.34C15.15 5.59 12.53 3 9.25 3S3.35 5.59 3.09 8.39a6.5 6.5 0 0010.92 5.34l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6.25 0C7.01 14 5 11.99 5 9.5S7.01 5 9.25 5 13.5 7.01 13.5 9.5 11.49 14 9.25 14z"/>
        </svg>
      </button>
      <button id="sp-lyrics" class="yellow-btn">Open lyrics page</button>
      <button id="sp-login" class="green-btn">Login</button>
      <button id="sp-logout" class="green-btn" style="display:none;">Log out</button>
      <div class="status" id="sp-status"></div>
    `;
		document.body.appendChild(el);
	}
	return el;
}

// ---------------------- Widget Update ----------------------
async function updateWidget(song, geniusData, coverUrl) {
	const titleEl = document.getElementById('sp-title');
	const artistEl = document.getElementById('sp-artist');
	const coverEl = document.getElementById('sp-cover');
	const lyricsBtn = document.getElementById('sp-lyrics');
	const searchBtn = document.getElementById('sp-search');
	const status = document.getElementById('sp-status');
	const bars = document.getElementById('sp-bars');

	if (song) {
		titleEl.textContent = song.title || '';
		artistEl.textContent = song.artist || '';
		coverEl.src = coverUrl || '';

		lyricsBtn.disabled = false;
		lyricsBtn.classList.remove('disabled-btn');
		lyricsBtn.onclick = () => {
			const baseQuery = `${song.title} ${song.artist}`.trim();
			const geniusUrl =
				geniusData?.url ||
				`https://genius.com/search?q=${encodeURIComponent(baseQuery)}`;
			// open in current tab
			window.location.href = geniusUrl;
		};

		status.textContent = '';
		bars.closest('#spotify-now-playing').classList.remove('paused');
	} else {
		titleEl.textContent = '';
		artistEl.textContent = '';
		coverEl.removeAttribute('src');
		lyricsBtn.disabled = true;
		lyricsBtn.classList.add('disabled-btn');
		lyricsBtn.onclick = null;
		status.textContent = 'No song playing on Spotify.';
		bars.closest('#spotify-now-playing').classList.add('paused');
	}

	searchBtn.onclick = () => {
		const cleanedTitle = cleanTitleForSearch(titleEl.textContent || '');
		const query = `${cleanedTitle} ${artistEl.textContent || ''}`.trim();
		window.open(
			`https://genius.com/search?q=${encodeURIComponent(query)}`,
			'_blank',
			'noopener,noreferrer',
		);
	};
}

// ---------------------- Update Song ----------------------
const geniusUrlCache = new Map();
const coverCache = new Map();
let lastSongKey = '';

async function updateSong() {
	try {
		const song = await getCurrentlyPlaying();
		const songKey = song ? `${song.title} - ${song.artist}` : '';

		if (!song) {
			lastSongKey = '';
			setAuthState(true);
			updateWidget(null, null, null);
			showStatus('No song playing on Spotify.');
			return;
		}

		setAuthState(true);
		showStatus('');

		let geniusData = geniusUrlCache.get(songKey) || null;
		let coverUrl = coverCache.get(songKey) || song.artUrl || '';

		if (songKey !== lastSongKey) {
			lastSongKey = songKey;

			if (!geniusData) {
				geniusData = await fetchGeniusUrlAndCover(
					song.title,
					song.artist,
				);
				geniusUrlCache.set(songKey, geniusData);
			}

			if (!coverUrl) {
				if (geniusData?.cover) {
					coverUrl = geniusData.cover;
				} else {
					const artistPageUrl = await fetchArtistPageUrl(song.artist);
					if (artistPageUrl) {
						coverUrl =
							await fetchArtistAvatarFromGeniusPageUrl(
								artistPageUrl,
							);
					}
				}
				coverCache.set(songKey, coverUrl || '');
			}
		}

		updateWidget(song, geniusData, coverUrl);
	} catch (e) {
		console.error('Error updating song:', e);
		setAuthState(false);
		updateWidget(null, null, null);
		showStatus('Not logged in to Spotify.');
		lastSongKey = '';
	}
}

// ---------------------- Auth Helpers ----------------------
function setAuthState(loggedIn) {
	const loginBtn = document.getElementById('sp-login');
	const logoutBtn = document.getElementById('sp-logout');
	const lyricsBtn = document.getElementById('sp-lyrics');
	const searchBtn = document.getElementById('sp-search');

	if (loggedIn) {
		loginBtn.style.display = 'none';
		logoutBtn.style.display = '';
		lyricsBtn.style.display = '';
		searchBtn.style.display = '';
	} else {
		loginBtn.style.display = '';
		logoutBtn.style.display = 'none';
		lyricsBtn.style.display = 'none';
		searchBtn.style.display = 'none';
	}
}

function showStatus(msg) {
	document.getElementById('sp-status').textContent = msg || '';
}

// ---------------------- Main Logic ----------------------
async function main() {
	addStyle();
	createWidget();
	await handleRedirectIfNeeded();

	document.getElementById('sp-login').onclick = async () => {
		await startLogin();
	};
	document.getElementById('sp-logout').onclick = async () => {
		await logout();
		setAuthState(false);
		updateWidget(null, null, null);
		showStatus('Logged out');
	};

	setInterval(updateSong, 1000);
	updateSong();
}

// ---------------------- Hide Apple Music Player ----------------------
function hideAppleMusicPlayer() {
	const selectors = [
		'div.apple_music_player',
		"div[class*='AppleMusic']",
		"iframe[src*='music.apple.com']",
	];
	selectors.forEach((sel) => {
		document.querySelectorAll(sel).forEach((el) => {
			el.style.display = 'none';
		});
	});
}

// --- Expose globals ---
window.updateSong = updateSong;
window.lastSongKey = lastSongKey;
window.geniusUrlCache = geniusUrlCache;

// ---------------------- Run ----------------------
if (window.top === window.self) {
	hideAppleMusicPlayer();
	const observer = new MutationObserver(hideAppleMusicPlayer);
	observer.observe(document.body, { childList: true, subtree: true });
	main();
}
