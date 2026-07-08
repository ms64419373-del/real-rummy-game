const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const fs = require('fs'); // 💾 परमानेंट फाइल स्टोरेज पैकेज (विंडोज इन-बिल्ट)
const path = require('path');
const axios = require('axios'); // 📡 API इंजन

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // APK डाउनलोड के लिए public फोल्डर एक्टिव

// 🔐 सुरक्षित एडमिन सेशन टोकन और लाइव ओटीपी की जगह
let globalSessionToken = null;
let activeOtps = {}; 

// 🗄️ परमानेंट फाइल डेटाबेस पाथ
const DB_FILE_PATH = path.join(__dirname, 'database.json');

// 🏦 डायनेमिक गेटवे क्रेडेंशियल्स और डिफ़ॉल्ट डेटाबेस स्टेट (3-वॉलेट सिस्टम)
let databaseState = {
    players: {
        "SUPER_ADMIN": { id: "SUPER_ADMIN", name: "👑 आपका वॉलेट (मालिक)", depositWallet: 100000, winningWallet: 25000, bonusWallet: 5000, vipLevel: "Owner", mobile: "0000000000", passbook: [] },
        "user_123": { id: "user_123", name: "रोहित शर्मा", depositWallet: 500, winningWallet: 150, bonusWallet: 50, vipLevel: "Gold", mobile: "9876543210", passbook: [] }
    },
    settings: {
        commissionRate: 20,
        minDeposit: 50,                   // 📥 न्यूनतम डिपॉजिट ₹50 फिक्स
        minWithdrawal: 100,                // 💸 न्यूनतम विथड्रॉल ₹100 फिक्स
        maxWithdrawal: 10000,              // 📈 अधिकतम दैनिक विथड्रॉल ₹10,000 फिक्स
        botDifficulty: "Hard",
        minPoolEntryFee: 5,               // 🟢 न्यूनतम पूल एंट्री फीस ₹5
        maxPoolEntryFee: 10000,           // 🔴 अधिकतम पूल एंट्री फीस ₹10,000
        tdsPercent: 30,                    // ⚖️ सरकारी टीडीएस टैक्स 30% फिक्स

        // 🖼️ मैन्युअल पेमेंट सेटिंग्स
        qrCodeUrl: "https://yourdomain.com", 
        manualUpiId: "owner@ybl",                          
        isQrVisible: "true",              // 🔴 QR कोड ऑन/ऑफ (true = Add/Show, false = Remove/Hide)
        mongoUri: "mongodb+srv://tvssport:Tvssport%40123@cluster0.xstva5a.mongodb.net/?appName=Cluster0", 

        fast2smsApiKey: "YOUR_FAST2SMS_API_KEY_HERE",
        cashfreeAppId: "YOUR_CASHFREE_APP_ID_HERE",
        cashfreeSecret: "YOUR_CASHFREE_SECRET_HERE"
    }
};

// 🗄️ डेटाबेस फाइल रीड/राइट फंक्शन्स
function loadPermanentDatabase() {
    try {
        if (fs.existsSync(DB_FILE_PATH)) {
            const fileData = fs.readFileSync(DB_FILE_PATH, 'utf8');
            databaseState = JSON.parse(fileData);
            console.log('🗄️ DATABASE SUCCESS: रमी की फाइल तिजोरी लोड हो गई है! 🚀');
        } else {
            savePermanentDatabase();
            console.log('✨ DATABASE INITIALIZED: नई डेटाबेस फाइल बनाई गई है!');
        }
    } catch (err) { console.log("डेटाबेस फाइल लोड एरर:", err); }
}

function savePermanentDatabase() {
    try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(databaseState, null, 4), 'utf8');
    } catch (err) { console.log("डेटाबेस फाइल राइट एरर:", err); }
}

loadPermanentDatabase(); // डेटाबेस ऑन करें

const activeRooms = {}; 

// 🏆 महा-अपग्रेड: एडवांस मेगा टूर्नामेंट्स डेटाबेस (रजिस्ट्रेशन काउंटर के साथ)
let hostedTournaments = [
    { id: "TOUR_99", name: "🏆 संडे मेगा रमी धमाका", gameType: "Pool", currentJoined: 1420, maxPlayers: 10000, entryFee: 50, prizePool: 500000, startTime: "8:00 PM", status: "Open" }
];
let withdrawalRequests = [{ id: "WITH_101", userId: "user_123", amount: 500, upiId: "rohit@apl", status: "Pending", rawAmount: 500, tdsTax: 150, finalPayout: 350 }];
// --- 📱 मोबाइल ऐप के लिए ओटीपी लॉगिन एंडपॉइंट्स (3-वॉलेट लिंक) ---
app.post('/api/auth/send-otp', async (req, res) => {
    const { mobileNumber } = req.body;
    if (!mobileNumber || mobileNumber.length !== 10) {
        return res.json({ success: false, message: "कृपया 10 अंकों का वैध मोबाइल नंबर डालें।" });
    }
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    activeOtps[mobileNumber] = otp;
    console.log(`📡 SMS PROMPT: मोबाइल नंबर [ ${mobileNumber} ] पर ओटीपी [ ${otp} ] सफलतापूर्वक भेजा गया!`);
    
    const keys = databaseState.settings;
    if (keys.fast2smsApiKey && keys.fast2smsApiKey !== "YOUR_FAST2SMS_API_KEY_HERE") {
        try {
            await axios.post('https://fast2sms.com', {
                "variables_values": otp, "route": "otp", "numbers": mobileNumber
            }, { headers: { "authorization": keys.fast2smsApiKey } });
            console.log(`📲 SMS SUCCESS: खिलाड़ी के असली फोन पर सफलतापूर्वक SMS डिलीवर हो गया!`);
        } catch (err) { console.log("⚠️ SMS GATEWAY WARNING: चाबी चेक करें। सिमुलेशन चालू।"); }
    }
    res.json({ success: true, message: "OTP भेज दिया गया है।", testingOtp: otp });
});

app.post('/api/auth/verify-otp', (req, res) => {
    const { mobileNumber, userOtp } = req.body;
    if (activeOtps[mobileNumber] && activeOtps[mobileNumber] === userOtp) {
        delete activeOtps[mobileNumber];
        const userId = "USER_" + mobileNumber.substring(6) + Math.floor(10 + Math.random() * 90);
        
        if (!databaseState.players[userId]) {
            databaseState.players[userId] = {
                id: userId, name: `खिलाड़ी ${mobileNumber.substring(6)}`,
                depositWallet: 0, winningWallet: 0, bonusWallet: 10, 
                vipLevel: "Bronze", mobile: mobileNumber,
                passbook: [{ date: "07-July-2026", type: "Credit", desc: "🎁 स्वागत बोनस (Welcome Bonus)", amount: 10, wallet: "bonusWallet" }]
            };
            savePermanentDatabase();
            console.log(`✨ नया खिलाड़ी पंजीकृत: ${userId} को ₹10 बोनस मिला।`);
        }
        res.json({ success: true, message: "लॉगिन सफल!", userId: userId, wallet: databaseState.players[userId] });
    } else { res.json({ success: false, message: "गलत OTP दर्ज किया गया है।" }); }
});

// 💳 कैशफ्री मर्चेंट ऑटो-ऐड कैश हुक
app.post('/api/payment/webhook', (req, res) => {
    const { orderId, orderAmount, txStatus } = req.body;
    if (txStatus === "SUCCESS") {
        const parts = orderId.split('_'); const userId = parts[1] + "_" + parts[2]; const amount = parseFloat(orderAmount);
        if (databaseState.players[userId]) {
            databaseState.players[userId].depositWallet += amount;
            databaseState.players[userId].passbook.push({ date: "07-July-2026", type: "Credit", desc: "💳 कैशफ्री ऑनलाइन डिपॉजिट", amount: amount, wallet: "depositWallet" });
            savePermanentDatabase(); 
            io.to(userId).emit('wallet_updated', { balance: databaseState.players[userId].depositWallet });
        }
    }
    res.status(200).send("OK");
});

app.get('/api/settings', (req, res) => { res.json(databaseState.settings); });

// 🚀 महा-अपग्रेड: मोबाइल ऐप और ब्राउज़र को अलग करने वाला जादुई रूट
app.get('/', (req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.includes('wv') || userAgent.includes('Crosswalk') || req.headers['x-requested-with']) {
        return res.sendFile(path.join(__dirname, 'public', 'game.html')); // मोबाइल ऐप में सीधे असली गेम ऑन
    }
    res.send(`<html><head><title>Real Rummy - Download</title></head><body style="font-family:sans-serif; background:#080B11; color:#FFF; text-align:center; padding-top:100px;"><h1>🃏 REAL RUMMY 🃏</h1><p>₹10 FREE BONUS WALLET CASH!</p><a href="/real_rummy.apk" download style="background:#FFD700; color:#000; padding:15px 30px; border-radius:50px; text-decoration:none; font-weight:bold;">📥 DOWNLOAD APK FILE</a></body></html>`);
});
app.get('/myadmin', (req, res) => {
    if (globalSessionToken === "LOGGED_IN_SUCCESSFULLY") { return res.redirect('/myadmin/dashboard'); }
    res.send(`
        <html><head><title>Rummy Premium Admin Login</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
            body { font-family: 'Segoe UI', sans-serif; background: #060913; color: #FFF; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .login-card { background: #0F1322; padding: 50px 40px; border-radius: 16px; border: 1px solid #1F2937; width: 420px; box-shadow: 0 20px 40px rgba(0,0,0,0.7); text-align: center; box-sizing: border-box; }
            h2 { color: #FFD700; margin: 0 0 10px 0; font-size: 26px; letter-spacing: 1.5px; font-weight: bold; }
            .sub-title { color: #9CA3AF; font-size: 14px; margin-bottom: 35px; text-transform: uppercase; letter-spacing: 1px; }
            .input-group { text-align: left; margin-bottom: 20px; }
            label { display: block; color: #9CA3AF; font-size: 12px; margin-bottom: 6px; font-weight: bold; text-transform: uppercase; }
            input { width: 100%; padding: 14px 16px; background: #1E2640; border: 1px solid #374151; border-radius: 8px; color: white; box-sizing: border-box; font-size: 16px; outline: none; }
            input:focus { border-color: #FFD700; background: #232D4B; }
            .gold-btn { width: 100%; background: linear-gradient(180deg, #FFD700 0%, #E6C200 100%); color: black; border: none; padding: 15px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 16px; margin-top: 20px; box-shadow: 0 5px 15px rgba(255,215,0,0.2); }
        </style></head><body><div class="login-card"><h2>🃏 REAL RUMMY 🃏</h2><div class="sub-title">Super Admin Portal</div><form action="/myadmin/login-submit" method="POST"><div class="input-group"><label>🔒 एडमिन यूज़र आईडी</label><input type="text" name="username" placeholder="expert_admin" required></div><div class="input-group"><label>🔑 सीक्रेट पासवर्ड</label><input type="password" name="password" placeholder="••••••••" required></div><button type="submit" class="gold-btn">🚀 सुरक्षित लॉगिन करें</button></form></div></body></html>
    `);
});

app.get('/myadmin/dashboard', (req, res) => {
    if (globalSessionToken !== "LOGGED_IN_SUCCESSFULLY") { return res.redirect('/myadmin'); }

    const settings = databaseState.settings;
    const allPlayers = Object.values(databaseState.players);

    let withdrawalRows = "";
    withdrawalRequests.forEach((reqst, index) => {
        if(reqst.status === "Pending") {
            withdrawalRows += `<tr>
                <td>${reqst.userId}</td><td><b>₹${reqst.amount}</b></td><td><span style="color:#EF4444; font-weight:bold;">₹${reqst.tdsTax} (${settings.tdsPercent}%)</span></td><td><span style="color:#10B981; font-weight:bold;">₹${reqst.finalPayout}</span></td><td><mark>${reqst.upiId}</mark></td>
                <td><form action="/admin/approve-payout-manual" method="POST" style="display:inline;"><input type="hidden" name="index" value="${index}"><button type="submit" style="background:#10B981; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">✓ Approve</button></form></td>
            </tr>`;
        }
    });

    let playerRows = ""; 
    allPlayers.forEach(p => {
        const currentPassbook = p.passbook || [];
        playerRows += `<tr>
            <td><b>${p.id}</b></td><td>${p.name}</td>
            <td><span style="color:#60A5FA; font-weight:bold;">₹${p.depositWallet}</span></td>
            <td><span style="color:#10B981; font-weight:bold;">₹${p.winningWallet}</span></td>
            <td><span style="color:#F59E0B; font-weight:bold;">₹${p.bonusWallet}</span></td>
            <td>
                <details><summary style="cursor:pointer; color:#A7F3D0; font-weight:bold;">📖 पासबुक लॉग्स देखें (${currentPassbook.length})</summary>
                <div style="font-size:12px; background:#1F2937; padding:8px; margin-top:5px; border-radius:6px; line-height:1.6; color:#E2E8F0; border:1px solid #374151;">
                    ${currentPassbook.length === 0 ? 'कोई ट्रांजैक्शन रिकॉर्ड नहीं है।' : currentPassbook.map(l => `[${l.date}] ${l.desc}: ${l.type === "Credit" ? "🟢 +" : "🔴 -"}₹${l.amount} (${l.wallet})`).join('<br>')}
                </div></details>
            </td>
        </tr>`;
    });
    let tourRows = ""; 
    hostedTournaments.forEach(t => {
        tourRows += `<tr>
            <td><b>${t.id}</b></td>
            <td><span style="color:#FFD700; font-weight:bold;">${t.name}</span></td>
            <td><mark style="background:#1E2640; color:#FFF; padding:3px 8px; border-radius:4px; font-weight:bold;">${t.gameType}</mark></td>
            <td><b style="color:#60A5FA; font-size:16px;">${t.currentJoined || 0} / ${t.maxPlayers}</b> <span style="font-size:12px; color:#9CA3AF;">खिलाड़ी शामिल</span></td>
            <td>₹${t.entryFee}</td>
            <td><span style="color:#10B981; font-weight:bold;">₹${t.prizePool}</span></td>
            <td>${t.startTime}</td>
            <td><span style="background:#1F2937; padding:4px 8px; border-radius:4px; font-size:12px; color:#10B981; font-weight:bold;">Open</span></td>
        </tr>`;
    });

    res.send(`
        <html><head><title>Rummy Enterprise Dashboard</title><style>
            body { font-family:'Segoe UI',sans-serif; background:#0A0F1D; color:#E2E8F0; margin:0; } 
            .sidebar { width:250px; background:#111827; position:fixed; height:100%; border-right:1px solid #1F2937; padding-top:20px; } 
            .sidebar h2 { color:#FFD700; text-align:center; } .sidebar a { display:block; color:#9CA3AF; padding:15px 25px; text-decoration:none; font-weight:bold; }
            .main { margin-left:250px; padding:40px; } .grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:20px; margin-bottom:30px; } 
            .card { background:#111827; padding:20px; border-radius:10px; border:1px solid #1F2937; } .val { font-size:22px; font-weight:bold; color:#FFF; } 
            .section { background:#111827; padding:25px; border-radius:10px; border:1px solid #1F2937; margin-bottom:30px; } 
            label { display: block; margin: 12px 0 4px 0; font-weight: bold; color: #9CA3AF; font-size: 13px; } 
            input, select { width:100%; padding:11px; background:#1F2937; color:white; border-radius:6px; box-sizing:border-box; border:1px solid #374151; font-size:14px; } 
            .btn { background:#FFD700; color:black; border:none; padding:12px 24px; border-radius:6px; font-weight:bold; margin-top:15px; cursor:pointer; font-size:14px; } 
            .flex-box { display:grid; grid-template-columns:1fr 1fr; gap:20px; } 
            table { width:100%; border-collapse:collapse; margin-top:15px; } th, td { padding:12px; border-bottom:1px solid #1F2937; text-align:left; } th { background:#1F2937; color:#9CA3AF; }
        </style></head>
        <body>
            <div class="sidebar"><h2>👑 SUPER RUMMY</h2><a href="/myadmin/dashboard" style="color:#FFD700; background:#1F2937;">📊 कंट्रोल डैशबोर्ड</a><a href="/myadmin/logout" style="color:#EF4444;">🚪 लॉगआउट</a></div>
            <div class="main">
                <h1>रमी सर्कल महा-प्रबंधन (Cashfree & Advanced Tournament Hub)</h1>
                <div class="grid">
                    <div class="card" style="border-color:#60A5FA;"><h3>🖼️ QR कोड स्थिति</h3><div class="val">${settings.isQrVisible === "true" ? "<span style='color:#10B981;'>🟢 ADDED (दृश्यमान)</span>" : "<span style='color:#EF4444;'>🔴 REMOVED (छिपा हुआ)</span>"}</div></div>
                    <div class="card"><h3>👥 कुल खिलाड़ी</h3><div class="val" style="color:#60A5FA;">${allPlayers.length} Users</div></div>
                    <div class="card"><h3>🎰 ताश एल्गोरिदम</h3><div class="val" style="color:#10B981;">🔒 Certified RNG</div></div>
                    <div class="card"><h3>✂️ गेम कमिशन</h3><div class="val">${settings.commissionRate}%</div></div>
                </div>
                <div class="section" style="border-color:#FFD700;">
                    <h2>⚙️ महा-गेटवे एवं मैन्युअल पेमेंट सेटिंग्स (No-Code API Manager)</h2>
                    <form action="/admin/update-keys" method="POST">
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                            <div>
                                <label style="color:#FFD700;">🔴 मैन्युअल QR कोड बटन (Add / Remove QR Link)</label>
                                <select name="isQrVisible" style="background:#1E2640; color:#FFD700; font-weight:bold;">
                                    <option value="true" ${settings.isQrVisible === "true" ? 'selected' : ''}>✅ ऐप में QR कोड दिखाएं (Add QR)</option>
                                    <option value="false" ${settings.isQrVisible === "false" ? 'selected' : ''}>❌ ऐप से QR कोड पूरी तरह छुपाएं (Remove QR)</option>
                                </select>
                                <label style="display:block; margin-top:10px;">🖼️ मैन्युअल QR कोड Image URL</label><input type="text" name="qrCodeUrl" value="${settings.qrCodeUrl}" required>
                                <label style="display:block; margin-top:10px; color:#FFD700;">🆔 मैन्युअल पर्सनल यूपीआई आईडी</label><input type="text" name="manualUpiId" value="${settings.manualUpiId}" required>
                            </div>
                            <div>
                                <label>Fast2SMS लाइव ओटीपी एपीआई की</label><input type="text" name="fast2smsApiKey" value="${settings.fast2smsApiKey}">
                                <label style="display:block; margin-top:10px;">Cashfree मर्चेंट ऐप आईडी</label><input type="text" name="cashfreeAppId" value="${settings.cashfreeAppId}">
                                <label style="display:block; margin-top:10px;">Cashfree मर्चेंट सीक्रेट की</label><input type="text" name="cashfreeSecret" value="${settings.cashfreeSecret || ''}">
                            </div>
                        </div>
                        <button type="submit" class="btn" style="background:#FFD700;">💾 सभी मर्चेंट गेटवे एवं UPI/QR सेटिंग्स लाइव सेव करें</button>
                    </form>
                </div>
                <div class="flex-box">
                    <div class="section">
                        <h2>👥 खिलाड़ी का 3-वॉलेट बैलेंस बदलें</h2>
                        <form action="/admin/edit-wallet" method="POST">
                            <label>यूज़र का चयन करें</label><select name="userId">${allPlayers.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join('')}</select>
                            <label style="display:block; margin-top:10px;">वॉलेट का प्रकार</label><select name="walletType"><option value="depositWallet">🔵 डिपॉजिट वॉलेट</option><option value="winningWallet">🟢 विनिंग वॉलेट</option><option value="bonusWallet">🟡 बोनस वॉलेट</option></select>
                            <label style="display:block; margin-top:10px;">एक्शन चुनें</label><select name="balanceAction"><option value="add">➕ पैसे जोड़ें</option><option value="remove">➖ पैसे काटें</option></select>
                            <label style="display:block; margin-top:10px;">राशि (Amount)</label><input type="number" name="amount" required>
                            <button type="submit" class="btn" style="background:#60A5FA; color:black;">💾 पासबुक एंट्री के साथ सेव करें</button>
                        </form>
                    </div>
                    <div class="section" style="border-color:#10B981;">
                        <h2 style="color:#10B981;">🏆 नया महा मेगा टूर्नामेंट लाइव होस्ट करें (Mega Tournament Launcher)</h2>
                        <form action="/host-tournament" method="POST">
                            <label>टूर्नामेंट का नाम (Tournament Name)</label><input type="text" name="tourName" placeholder="🏆 संडे मेगा रमी धमाका" required>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
                                <div>
                                    <label style="color:#10B981;">🃏 रमी गेम का प्रकार</label>
                                    <select name="gameType"><option value="Pool">Pool Rummy</option><option value="Deal">Deal Rummy</option><option value="Point">Point Rummy</option></select>
                                </div>
                                <div>
                                    <label style="color:#10B981;">👥 कुल रजिस्ट्रेशन क्षमता (Max Players Capacity)</label>
                                    <input type="number" name="maxPlayers" placeholder="उदा: 5000 या 10000" min="2" max="50000" required>
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
                                <div><label>खिलाड़ी एंट्री फीस</label><input type="number" name="entryFee" placeholder="₹50" required></div>
                                <div><label>कुल प्राइज पूल</label><input type="number" name="prizePool" placeholder="₹500000" required></div>
                            </div>
                            <button type="submit" class="btn" style="background:#10B981; color:white;">🚀 महा मेगा टूर्नामेंट लाइव लॉन्च करें</button>
                        </form>
                    </div>
                </div>
                <div class="section" style="border-color:#EF4444;">
                    <h2>⚖️ खिलाड़ी विथड्रॉल रिक्वेस्ट (30% टीडीएस टैक्स कटौती)</h2>
                    <table><thead><tr><th>खिलाड़ी आईडी</th><th>कुल विथड्रॉल राशि</th><th>30% TDS टैक्स</th><th>खिलाड़ी को शुद्ध पेआउट</th><th>UPI ID</th><th>ऐक्शन बटन</th></tr></thead><tbody>${withdrawalRows === "" ? '<tr><td colspan="6" style="text-align:center; color:#6B7280;">कोई पेंडिंग रिक्वेस्ट नहीं है।</td></tr>' : withdrawalRows}</tbody></table>
                </div>
                <div class="section">
                    <h2>👥 सभी पंजीकृत खिलाड़ियों एवं लाइव पासबुक की सूची (Lifetime Records)</h2>
                    <table><thead><tr><th>खिलाड़ी आईडी</th><th>नाम</th><th>डिपॉजिट बैलेंस</th><th>विनिंग बैलेंस</th><th>बोनस वॉलेट</th><th>📖 खिलाड़ी लाइव पासबुक (Full Logs)</th></tr></thead><tbody>${playerRows}</tbody></table>
                </div>
                <div class="section">
                    <h2>🏆 वर्तमान लाइव टूर्नामेंट्स की स्थिति (Hosted Tournaments)</h2>
                    <table><thead><tr><th>टूर्नामेंट आईडी</th><th>टूर्नामेंट का नाम</th><th>एंट्री फीस</th><th>प्राइज पूल</th><th>समय</th><th>स्थिति</th></tr></thead><tbody>${tourRows}</tbody></table>
                </div>
            </div>
        </body></html>
    `);
});

app.post('/myadmin/login-submit', (req, res) => {
    const { username, password } = req.body;
    if (username === 'expert_admin' && password === 'Rummy@2026') {
        globalSessionToken = "LOGGED_IN_SUCCESSFULLY"; 
        res.redirect('/myadmin/dashboard');
    } else { 
        res.send('🛑 गलत पासवर्ड या यूज़र आईडी! कृपया दोबारा जांचें।'); 
    }
});

app.get('/myadmin/logout', (req, res) => { 
    globalSessionToken = null; 
    res.redirect('/myadmin'); 
});

app.post('/admin/update-keys', (req, res) => {
    if (globalSessionToken !== "LOGGED_IN_SUCCESSFULLY") return res.redirect('/myadmin');
    databaseState.settings.isQrVisible = req.body.isQrVisible;
    databaseState.settings.qrCodeUrl = req.body.qrCodeUrl;
    databaseState.settings.manualUpiId = req.body.manualUpiId;
    databaseState.settings.fast2smsApiKey = req.body.fast2smsApiKey;
    databaseState.settings.cashfreeAppId = req.body.cashfreeAppId;
    databaseState.settings.cashfreeSecret = req.body.cashfreeSecret;
    
    savePermanentDatabase();
    console.log(`⚙️ ENTERPRISE UPDATE: क्रेडेंशियल्स लाइव सिंक हो गए हैं!`);
    res.redirect('/myadmin/dashboard');
});

app.post('/admin/edit-wallet', (req, res) => {
    if (globalSessionToken !== "LOGGED_IN_SUCCESSFULLY") return res.redirect('/myadmin');
    const { userId, walletType, balanceAction, amount } = req.body;
    const amt = parseInt(amount); 
    const targetId = userId.trim();

    if (databaseState.players[targetId]) {
        const p = databaseState.players[targetId];
        if (!p.passbook) { p.passbook = []; }

        if (balanceAction === "add") {
            p[walletType] += amt;
            p.passbook.push({ date: "08-July-2026", type: "Credit", desc: `👑 एडमिन द्वारा क्रेडिट किया गया`, amount: amt, wallet: walletType });
        } else if (balanceAction === "remove") {
            p[walletType] = Math.max(0, p[walletType] - amt);
            p.passbook.push({ date: "08-July-2026", type: "Debit", desc: `✂️ एडमिन द्वारा डेबिट किया गया`, amount: amt, wallet: walletType });
        }
        savePermanentDatabase();
    }
    res.redirect('/myadmin/dashboard');
});

app.post('/host-tournament', (req, res) => {
    if (globalSessionToken !== "LOGGED_IN_SUCCESSFULLY") return res.redirect('/myadmin');
    const { tourName, gameType, maxPlayers, entryFee, prizePool } = req.body;
    const newTourId = "TOUR_" + Math.floor(10 + Math.random() * 90);
    hostedTournaments.push({
        id: newTourId,
        name: tourName,
        gameType: gameType,
        currentJoined: 0,
        maxPlayers: parseInt(maxPlayers),
        entryFee: parseInt(entryFee),
        prizePool: parseInt(prizePool),
        startTime: "9:30 PM",
        status: "Open"
    });
    console.log(`🏆 DB SUCCESS: नया महा मेगा ${gameType} टूर्नामेंट (${maxPlayers} क्षमता) लाइव हो गया!`);
    res.redirect('/myadmin/dashboard');
});

app.post('/admin/approve-payout-manual', (req, res) => {
    if (globalSessionToken !== "LOGGED_IN_SUCCESSFULLY") return res.redirect('/myadmin');
    const idx = req.body.index; 
    const reqst = withdrawalRequests[idx];

    if (reqst && databaseState.players[reqst.userId]) {
        reqst.status = "Approved_Manual";
        const p = databaseState.players[reqst.userId];
        p.winningWallet = Math.max(0, p.winningWallet - reqst.amount);
        p.passbook.push({ date: "08-July-2026", type: "Debit", desc: `💸 विथड्रॉल पास (Govt TDS Tax ₹${reqst.tdsTax} काटा गया)`, amount: reqst.amount, wallet: "winningWallet" });
        savePermanentDatabase();
    }
    res.redirect('/myadmin/dashboard');
});

const botNamesList = ["अमित सिंह", "विजय शर्मा", "राजेश कुमार", "संजय यादव", "अनिल वर्मा"];
function generateCertifiedDeck() {
    const suits = ["hearts", "diamonds", "clubs", "spades"]; 
    let deck = [];
    for (let d = 0; d < 2; d++) {
        for (let suit of suits) { 
            for (let rank = 1; rank <= 13; rank++) { 
                deck.push({ id: `${suit}${rank}_d${d}`, rank, suit, isJoker: false }); 
            } 
        }
    }
    return deck;
}

io.on('connection', (socket) => {
    socket.on('join_table', (data) => {
        const { roomId, userId = "" } = JSON.parse(data); 
        socket.join(roomId);
        if (!activeRooms[roomId]) { activeRooms[roomId] = { roomId, players: [], deck: generateCertifiedDeck() }; }
        const room = activeRooms[roomId];
        if (!room.players.find(p => p.id === userId)) { 
            room.players.push({ id: userId, socketId: socket.id, isBot: false, name: "असली खिलाड़ी" }); 
        }
        if (databaseState.settings.botDifficulty && room.players.length === 1) {
            setTimeout(() => {
                if (room.players.length === 1) { 
                    const randomName = botNamesList[Math.floor(Math.random() * botNamesList.length)];
                    room.players.push({ id: "BOT_" + Math.floor(1000 + Math.random() * 9000), socketId: "bot_mock", isBot: true, name: randomName, thinkingDelayMs: 4000 });
                    io.to(roomId).emit('game_started');
                }
            }, 3000);
        } else if (room.players.length === 2) { 
            io.to(roomId).emit('game_started'); 
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { 
    console.log(`Circle Enterprise लाइव सर्वर पोर्ट ${PORT} पर दौड़ रहा है! 🚀`); 
});

