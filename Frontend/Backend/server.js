// server.js - AfroGamers AI Bot - ALL ONLINE GAMES
// No game_id filter. If gamer goes live with ANY online game, bot finds + notifies.
const express = require('express');
const cors = require('cors');
const tmi = require('tmi.js');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 1. Twitch Bot Client
const twitchClient = new tmi.Client({
	identity: { username: 'afrogamers_bot', password: process.env.TWITCH_BOT_OAUTH },
	channels: []
});
twitchClient.connect().then(()=> console.log('Bot connected as afrogamers_bot')).catch(e=> console.log('Bot connect error - check TWITCH_BOT_OAUTH', e.message));

// 2. Block only non-gaming categories
const BLOCKED_GAMES = ['music','just chatting','talk shows & podcasts','cooking','sports','news','crypto','art','irl'];
function isOnlineGame(gameName){
	if(!gameName) return true;
	return !BLOCKED_GAMES.includes(gameName.toLowerCase());
}

// 3. Get Twitch App Token
async function getAppToken(){
	let r = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`);
	return r.data.access_token;
}

// 4. Check LIVE every 60 secs - ALL GAMES
let knownLive = new Set();
let latestStreams = [];
async function checkLive(){
	try{
		let token = await getAppToken();
		// NO game_id here - this is the ALL GAMES fix. Gets first 100 live streams of ANY game.
		let res = await axios.get('https://api.twitch.tv/helix/streams?first=100&language=en', { headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } });
		latestStreams = res.data.data.filter(s => isOnlineGame(s.game_name));
		for(let s of latestStreams){
			if(!knownLive.has(s.user_id)){
				knownLive.add(s.user_id);
				console.log(`NEW LIVE [${s.game_name}]:`, s.user_name, s.viewer_count);
				// Notify in their chat - THIS IS THE NOTIFICATION
				try{
					await twitchClient.join(s.user_login);
					setTimeout(()=> {
						twitchClient.say(s.user_login, `🔴 You are LIVE on AfroGamers App playing ${s.game_name}! ${s.viewer_count} people can see you now. Claim your profile to get verified ✅ - afrogamers.com`);
					}, 2000);
				}catch(e){ console.log('Bot join error', e.message); }
			}
		}
		let currentIds = new Set(res.data.data.map(s=>s.user_id));
		knownLive.forEach(id=>{ if(!currentIds.has(id)) knownLive.delete(id); });
	}catch(e){ console.log('checkLive error', e.message); }
}
checkLive();
setInterval(checkLive, 60000);

// 5. Routes for Frontend
app.get('/', (req,res)=> res.json({ status: 'AfroGamers AI Bot is ONLINE', bot: 'afrogamers_bot', mode: 'ALL ONLINE GAMES', live_now: latestStreams.length }));
app.get('/api/live', (req,res)=> res.json({ streams: latestStreams }));
app.post('/api/bot/notify', async (req,res)=>{
	const { streamer, message } = req.body;
	try{ await twitchClient.join(streamer); twitchClient.say(streamer, message || '🔴 You are LIVE on AfroGamers App!'); res.json({ success:true, message: 'Bot will notify '+streamer }); }
	catch(e){ res.json({ success:false, message: e.message }); }
});
app.post('/api/bot/ask', (req,res)=>{ res.json({ answer: 'I am AfroGamers AI Bot. I watch ALL online games. Ask: Who is live in Roblox?' }); });

// 6. Claim Verify - Real ID check, no fake claim
app.post('/api/claim/verify', async (req,res)=>{
	try{
		const { code, claim_streamer_id } = req.body;
		let tokenRes = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${process.env.REDIRECT_URI}`);
		let userRes = await axios.get('https://api.twitch.tv/helix/users', { headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${tokenRes.data.access_token}` } });
		let realId = userRes.data.data[0].id;
		if(realId === claim_streamer_id) res.json({ success:true, verified:true, user: userRes.data.data[0] });
		else res.json({ success:false, message: 'This is not your account.' });
	}catch(e){ res.json({ success:false, message: e.message }); }
});

app.listen(PORT, ()=> console.log('AfroGamers Bot running on', PORT));
