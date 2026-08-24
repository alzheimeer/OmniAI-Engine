import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testHashnode() {
    const apiKey = process.env.HASHNODE_API_KEY;
    const pubId = process.env.HASHNODE_PUBLICATION_ID;

    console.log('Testing Hashnode API Key:', apiKey ? 'Present' : 'Missing');
    console.log('Testing Publication ID:', pubId);

    // Hashnode API v1 endpoint
    const endpoint = 'https://api.hashnode.com';

    const query = `
        query {
            user(username: "niklauss") {
                _id
                name
                username
                publications {
                    _id
                    title
                    domain
                }
            }
        }
    `;

    try {
        const res = await axios.post(endpoint, { query }, {
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            }
        });
        console.log('API Response:', JSON.stringify(res.data, null, 2));
    } catch (err: any) {
        console.error('Error:', err.response?.data || err.message);
    }
}

testHashnode();
