const express = require('express');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const { 
    PORT, 
    DARAJA_CONSUMER_KEY, 
    DARAJA_CONSUMER_SECRET, 
    BUSINESS_SHORTCODE, 
    PASSKEY, 
    CALLBACK_URL 
} = process.env;

let accessToken = null;
let tokenExpiry = 0;

// Log environment variables (For Debugging)
console.log("DARAJA_CONSUMER_KEY:", DARAJA_CONSUMER_KEY ? "Loaded" : "Missing");
console.log("DARAJA_CONSUMER_SECRET:", DARAJA_CONSUMER_SECRET ? "Loaded" : "Missing");
console.log("BUSINESS_SHORTCODE:", BUSINESS_SHORTCODE);
console.log("CALLBACK_URL:", CALLBACK_URL);

// Root route
app.get('/', (req, res) => {
    res.send('Server is running...');
});

// API for predictions
app.get('/api/predictions', (req, res) => {
    res.json({ message: "Predictions endpoint working" });
});

// M-Pesa Callback Route
app.post('/callback', (req, res) => {
    console.log("Mpesa Callback Received:", JSON.stringify(req.body, null, 2));
    res.status(200).json({ message: "Callback received successfully" });
});

// Generate and Cache Access Token
async function getAccessToken() {
    const currentTime = Math.floor(Date.now() / 1000);

    if (accessToken && currentTime < tokenExpiry) {
        console.log("Using cached access token");
        return accessToken;
    }

    try {
        const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');

        const response = await axios.get(
            'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            { headers: { Authorization: `Basic ${auth}` } }
        );

        accessToken = response.data.access_token;
        tokenExpiry = currentTime + parseInt(response.data.expires_in) - 10; // 10 sec buffer

        console.log("New Access Token Retrieved:", accessToken);
        return accessToken;

    } catch (error) {
        console.error('Access Token Error:', error?.response?.data || error.message);
        throw new Error('Failed to obtain access token');
    }
}

// Handle STK Push Payment
app.post('/pay', async (req, res) => {
    const { phone } = req.body;
    
    if (!phone) {
        return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const timestamp = new Date().toISOString().replace(/[-T:Z]/g, '').slice(0, 14); // Ensure valid timestamp
    const password = Buffer.from(`${BUSINESS_SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');

    try {
        const accessToken = await getAccessToken();

        const response = await axios.post(
            'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            {
                BusinessShortCode: BUSINESS_SHORTCODE,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: 20,
                PartyA: phone,
                PartyB: BUSINESS_SHORTCODE,
                PhoneNumber: phone,
                CallBackURL: CALLBACK_URL,
                AccountReference: 'PeronTips',
                TransactionDesc: 'Betting Prediction'
            },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        console.log("STK Push Response:", response.data);
        res.json({ success: true, accessUrl: 'https://perontips-frontend.vercel.app/' });

    } catch (error) {
        if (error.response?.status === 401 || error.response?.data?.errorMessage?.includes("Invalid Access Token")) {
            console.warn("Access Token Expired. Refreshing...");
            accessToken = null; // Force token refresh
            return app.post('/pay', req, res); // Retry payment
        }

        console.error("Payment Error:", error?.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Payment failed', error: error?.response?.data || error.message });
    }
});

app.listen(PORT || 5000, () => console.log(`Backend running on port ${PORT || 5000}`));
