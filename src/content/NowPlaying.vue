<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import {
	getCurrentlyPlaying,
	startLogin,
	logout,
	handleRedirectIfNeeded,
	getUserProfile,
} from '../services/spotifyApi.js';
import {
	fetchGeniusUrlAndCover,
	fetchArtistPageUrl,
	fetchArtistAvatarFromGeniusPageUrl,
} from '../services/geniusApi.js';

const song = ref(null);
const geniusUrl = ref(null);
const coverUrl = ref(null);
const loggedIn = ref(false);
const username = ref('');
const status = ref('');
const isUpdating = ref(false);

const geniusUrlCache = new Map();
const coverCache = new Map();
let lastSongKey = '';
let interval = null;

const instrumentalRegex =
	/\((Instrumental)\)|\[(Instrumental)\]|Instrumental Remake/i;

function cleanTitleForManualSearch(title) {
	if (!title) return '';
	return title
		.replace(/\((feat\.|ft\.)[^\)]*\)/gi, '')
		.replace(instrumentalRegex, '')
		.replace(/[()\[\]]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

async function updateSong() {
	if (!loggedIn.value || isUpdating.value) return;
	isUpdating.value = true;

	try {
		const current = await getCurrentlyPlaying();
		if (!current) {
			lastSongKey = '';
			song.value = null;
			geniusUrl.value = null;
			coverUrl.value = null;
			status.value = 'No song playing.';
			isUpdating.value = false;
			return;
		}

		const isInstrumental = instrumentalRegex.test(current.title);
		const searchArtist =
			isInstrumental && current.isLocal
				? current.artist
				: current.albumArtist || current.artist;

		const songKey = `${current.title} - ${searchArtist}`;
		status.value = '';
		song.value = current;

		if (songKey !== lastSongKey) {
			lastSongKey = songKey;

			// NEW: Reset both URL and Cover immediately on track change
			geniusUrl.value = null;
			coverUrl.value = '';

			if (!geniusUrlCache.has(songKey)) {
				const result = await fetchGeniusUrlAndCover(
					current.title,
					searchArtist,
				);
				geniusUrlCache.set(songKey, result);
			}
			const data = geniusUrlCache.get(songKey);
			geniusUrl.value = data?.url ?? null;

			if (!coverCache.has(songKey)) {
				let url = data?.cover || current.artUrl || '';
				if (!url) {
					const artistPageUrl =
						await fetchArtistPageUrl(searchArtist);
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
		console.error(e);
	} finally {
		isUpdating.value = false;
	}
}

async function checkLoginStatus() {
	const profile = await getUserProfile();
	if (profile) {
		username.value = profile.display_name || profile.id;
		loggedIn.value = true;
		return true;
	}
	loggedIn.value = false;
	return false;
}

async function handleLogin() {
	await startLogin();
}

async function handleLogout() {
	if (interval) clearInterval(interval);
	await logout();
	loggedIn.value = false;
	song.value = null;
	geniusUrl.value = null;
	coverUrl.value = null;
}

function openSearch() {
	const isInstrumental = instrumentalRegex.test(song.value?.title || '');
	const searchArtist =
		isInstrumental && song.value?.isLocal
			? song.value?.artist
			: song.value?.albumArtist || song.value?.artist;
	const query =
		`${cleanTitleForManualSearch(song.value?.title)} ${searchArtist}`.trim();
	window.open(
		`https://genius.com/search?q=${encodeURIComponent(query)}`,
		'_blank',
	);
}

function openLyrics() {
	if (geniusUrl.value) {
		window.location.href = geniusUrl.value;
	}
}

onMounted(async () => {
	await handleRedirectIfNeeded();
	if (await checkLoginStatus()) {
		await updateSong();
		interval = setInterval(updateSong, 5000);
	}
});

onUnmounted(() => {
	if (interval) clearInterval(interval);
});
</script>

<template>
	<div id="spotify-now-playing" :class="{ paused: !song }">
		<div class="cover-wrap">
			<div class="audio-bars" id="sp-bars">
				<span></span><span></span><span></span>
			</div>
			<img v-if="coverUrl" :src="coverUrl" alt="" />
			<div v-else class="cover-placeholder"></div>
		</div>
		<div class="meta">
			<div v-if="song" class="song-info">
				<div class="title">{{ song.title }}</div>
				<div class="artist">{{ song.artist }}</div>
			</div>
			<div v-else class="user-status">
				<span v-if="loggedIn" class="logged-in-as"
					>Logged in as <strong>{{ username }}</strong></span
				>
				<span v-else>Please login to Spotify</span>
			</div>
		</div>
		<button v-if="loggedIn && song" class="search-btn" @click="openSearch">
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
			id="gs-genius-link"
			:disabled="!song || !geniusUrl"
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
		<div id="gs-error" class="status">{{ status }}</div>
	</div>
</template>

<style scoped>
#spotify-now-playing,
#spotify-now-playing * {
	font-family: 'Programme', 'Arial', sans-serif !important;
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
#spotify-now-playing img,
.cover-placeholder {
	height: 50px;
	width: 50px;
	object-fit: cover;
	box-shadow: 0 0 5px rgba(255, 255, 255, 0.25);
}
.cover-placeholder {
	background: #222;
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
#spotify-now-playing button.yellow-btn {
	background-color: #ffff64;
	color: #0f111a;
	border-color: #ffff64;
}
#spotify-now-playing button.green-btn {
	background-color: #1db954;
	color: #0f111a;
	border-color: #1db954;
}
#spotify-now-playing button:hover {
	background-color: #fff;
	border-color: #fff;
}
#spotify-now-playing button:disabled {
	opacity: 0.3;
	cursor: not-allowed;
	filter: grayscale(1);
}
.logged-in-as {
	font-size: 14px;
	color: #1db954;
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
}
.audio-bars span {
	width: 4.5px;
	height: 100%;
	background: #1db954;
	border: 0.75px solid #000;
	border-radius: 12px 12px 0 0;
	transform-origin: bottom;
}
.audio-bars span:nth-child(1) {
	animation: barPulse 1.2s infinite ease-in-out;
}
.audio-bars span:nth-child(2) {
	animation: barPulse 1.35s infinite ease-in-out;
}
.audio-bars span:nth-child(3) {
	animation: barPulse 1.05s infinite ease-in-out;
}
@keyframes barPulse {
	0%,
	100% {
		transform: scaleY(0.3);
	}
	50% {
		transform: scaleY(1);
	}
}
.paused .audio-bars span {
	animation-play-state: paused;
	transform: scaleY(0.35);
}
</style>
