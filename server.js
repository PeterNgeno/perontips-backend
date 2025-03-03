require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const {
    PORT, DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET,
    BUSINESS_SHORTCODE, PASSKEY, CALLBACK_URL
} = process.env;

// Generate access token
async function getAccessToken() {
    const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
    const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
        headers: { Authorization: `Basic ${auth}` }
    });
    return response.data.access_token;
}

// Handle STK Push
app.post('/pay', async (req, res) => {
    const { phone } = req.body;
    const timestamp = new Date().toISOString().replace(/[-T:Z]/g, '');
    const password = Buffer.from(`${BUSINESS_SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');

    try {
        const accessToken = await getAccessToken();

        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
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

        res.json({ success: true, accessUrl: 'https://perontips-frontend.vercel.app/' });
    } catch (error) {
        res.json({ success: false, message: 'Payment failed' });
    }
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
