<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import {
	getCurrentlyPlaying,
	startLogin,
	logout,
	handleRedirectIfNeeded,
} from '../services/spotifyApi.js';
import {
	fetchGeniusUrlAndCover,
	fetchArtistPageUrl,
	fetchArtistAvatarFromGeniusPageUrl,
} from '../services/geniusApi.js';

// ---------------------- State ----------------------
const song = ref(null);
const geniusUrl = ref(null);
const coverUrl = ref(null);
const loggedIn = ref(false);
const status = ref('');

const geniusUrlCache = new Map();
const coverCache = new Map();
let lastSongKey = '';
let interval = null;

// ---------------------- Helper ----------------------
function cleanTitleForSearch(title) {
	if (!title) return '';
	return title
		.replace(/\((feat\.|ft\.).*?\)/gi, '')
		.replace(/\((.*?)\)/g, '$1')
		.trim();
}

// ---------------------- Update Song ----------------------
async function updateSong() {
	try {
		const current = await getCurrentlyPlaying();
		const songKey = current ? `${current.title} - ${current.artist}` : '';

		if (!current) {
			lastSongKey = '';
			loggedIn.value = true;
			song.value = null;
			status.value = 'No song playing on Spotify.';
			return;
		}

		loggedIn.value = true;
		status.value = '';
		song.value = current;

		if (songKey !== lastSongKey) {
			lastSongKey = songKey;

			if (!geniusUrlCache.has(songKey)) {
				geniusUrlCache.set(
					songKey,
					await fetchGeniusUrlAndCover(current.title, current.artist),
				);
			}
			const data = geniusUrlCache.get(songKey);
			geniusUrl.value = data?.url ?? null;

			if (!coverCache.has(songKey)) {
				let url = data?.cover || current.artUrl || '';
				if (!url) {
					const artistPageUrl = await fetchArtistPageUrl(
						current.artist,
					);
					if (artistPageUrl)
						url =
							await fetchArtistAvatarFromGeniusPageUrl(
								artistPageUrl,
							);
				}
				coverCache.set(songKey, url);
			}
			coverUrl.value = coverCache.get(songKey) || '';
		}
	} catch (e) {
		console.error('Error updating song:', e);
		loggedIn.value = false;
		song.value = null;
		status.value = 'Not logged in to Spotify.';
		lastSongKey = '';
	}
}

// ---------------------- Actions ----------------------
async function handleLogin() {
	await startLogin();
}

async function handleLogout() {
	await logout();
	loggedIn.value = false;
	song.value = null;
	status.value = 'Logged out';
}

function openLyrics() {
	const baseQuery = `${song.value.title} ${song.value.artist}`.trim();
	const url =
		geniusUrl.value ||
		`https://genius.com/search?q=${encodeURIComponent(baseQuery)}`;
	window.location.href = url;
}

function openSearch() {
	const cleanedTitle = cleanTitleForSearch(song.value?.title || '');
	const query = `${cleanedTitle} ${song.value?.artist || ''}`.trim();
	window.open(
		`https://genius.com/search?q=${encodeURIComponent(query)}`,
		'_blank',
		'noopener,noreferrer',
	);
}

// ---------------------- Lifecycle ----------------------
onMounted(async () => {
	await handleRedirectIfNeeded();
	await updateSong();
	interval = setInterval(updateSong, 1000);
});

onUnmounted(() => clearInterval(interval));
</script>

<template>
	<div id="spotify-now-playing" :class="{ paused: !song }">
		<div class="cover-wrap">
			<div class="audio-bars" id="sp-bars">
				<span></span><span></span><span></span>
			</div>
			<img v-if="coverUrl" :src="coverUrl" alt="" />
		</div>

		<div class="meta">
			<div class="title">{{ song?.title || '' }}</div>
			<div class="artist">{{ song?.artist || '' }}</div>
		</div>

		<button
			v-if="loggedIn"
			class="search-btn"
			title="Search manually"
			@click="openSearch"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="black"
				width="16"
				height="16"
			>
				<path
					d="M15.5 14h-.79l-.28-.27a6.471 6.471 0 001.48-5.34C15.15 5.59 12.53 3 9.25 3S3.35 5.59 3.09 8.39a6.5 6.5 0 0010.92 5.34l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6.25 0C7.01 14 5 11.99 5 9.5S7.01 5 9.25 5 13.5 7.01 13.5 9.5 11.49 14 9.25 14z"
				/>
			</svg>
		</button>

		<button
			v-if="loggedIn"
			class="yellow-btn"
			:disabled="!song"
			@click="openLyrics"
		>
			Open lyrics page
		</button>

		<button v-if="!loggedIn" class="green-btn" @click="handleLogin">
			Login
		</button>
		<button v-if="loggedIn" class="green-btn" @click="handleLogout">
			Log out
		</button>

		<div class="status">{{ status }}</div>
	</div>
</template>

<style scoped>
#spotify-now-playing,
#spotify-now-playing * {
	font-family: 'Programme', sans-serif !important;
	color: #fff;
}
#spotify-now-playing {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 14px;
	padding-right: 24px;
	background: #0f111a;
	border-top: 1px solid #222;
	z-index: 999999;
}
#spotify-now-playing img {
	height: 50px;
	width: 50px;
	object-fit: cover;
	box-shadow: 0 0 5px rgba(255, 255, 255, 0.25);
}
#spotify-now-playing .meta {
	flex: 1;
	min-width: 0;
}
#spotify-now-playing .title {
	font-weight: 700;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
#spotify-now-playing .artist {
	color: #bbb;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.status {
	color: #ff4d4d;
	font-size: 12px;
	margin-top: 2px;
}
#spotify-now-playing button {
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
	border: 2.5px solid transparent;
	border-radius: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 6px 14px;
}
#spotify-now-playing button.search-btn {
	background-color: #ffff64;
	color: #0f111a;
	border-color: #ffff64;
	padding: 6px;
	height: 32px;
	aspect-ratio: 1/1;
}
#spotify-now-playing button.search-btn:hover {
	background-color: #fff;
	border-color: #fff;
	color: #0f111a;
}
#spotify-now-playing button.yellow-btn {
	background-color: #ffff64;
	color: #0f111a;
	border-color: #ffff64;
}
#spotify-now-playing button.yellow-btn:hover {
	background-color: #fff;
	border-color: #fff;
	color: #0f111a;
}
#spotify-now-playing button.green-btn {
	background-color: #1db954;
	color: #0f111a;
	border-color: #1db954;
}
#spotify-now-playing button.green-btn:hover {
	background-color: #fff;
	border-color: #fff;
	color: #0f111a;
}
.cover-wrap {
	display: flex;
	align-items: flex-end;
	gap: 6px;
	height: 50px;
}
.audio-bars {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	height: 35%;
	width: 16px;
	margin-right: 0.5px;
	animation: speedCycle 6s ease-in-out infinite;
	transform-origin: bottom center;
}
.audio-bars span {
	display: block;
	width: 4.5px;
	height: 100%;
	background: #1db954;
	border: 0.75px solid #000;
	border-top-left-radius: 12px;
	border-top-right-radius: 12px;
	transform-origin: bottom center;
	will-change: transform;
	backface-visibility: hidden;
}
.audio-bars span:nth-child(1) {
	animation: barPulse1 1.2s ease-in-out infinite;
}
.audio-bars span:nth-child(2) {
	animation: barPulse2 1.35s ease-in-out infinite;
}
.audio-bars span:nth-child(3) {
	animation: barPulse3 1.05s ease-in-out infinite;
}
@keyframes barPulse1 {
	0%,
	100% {
		transform: scaleY(0.3);
	}
	50% {
		transform: scaleY(1);
	}
}
@keyframes barPulse2 {
	0%,
	100% {
		transform: scaleY(0.25);
	}
	50% {
		transform: scaleY(0.9);
	}
}
@keyframes barPulse3 {
	0%,
	100% {
		transform: scaleY(0.35);
	}
	50% {
		transform: scaleY(0.8);
	}
}
@keyframes speedCycle {
	0%,
	30% {
		transform: scaleY(1);
	}
	30%,
	80% {
		transform: scaleY(1.3);
	}
	100% {
		transform: scaleY(1);
	}
}
.paused .audio-bars span {
	animation-play-state: paused;
	transform: scaleY(0.35);
}
</style>
