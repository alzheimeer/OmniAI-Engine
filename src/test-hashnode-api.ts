import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testHashnodeV2() {
    const apiKey = process.env.HASHNODE_API_KEY;
    const pubId = process.env.HASHNODE_PUBLICATION_ID;

    console.log('Testing Hashnode API Key:', apiKey);
    console.log('Publication ID:', pubId);

    const query = `
        query {
            me {
                id
                username
                name
                publications(first: 5) {
                    edges {
                        node {
                            id
                            title
                            url
                        }
                    }
                }
            }
        }
    `;

    try {
        const res = await axios.post('https://gql.hashnode.com', { query }, {
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            }
        });
        console.log('API V2 Success:', JSON.stringify(res.data, null, 2));
    } catch (err: any) {
        console.error('API V2 Error:', err.response?.data || err.message);
    }
}

testHashnodeV2();
