import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function getPublicationId() {
    const token = process.env.HASHNODE_API_KEY;
    if (!token) return;

    try {
        const query = `
            query {
                me {
                    id
                    username
                    publications(first: 1) {
                        edges {
                            node {
                                id
                                title
                            }
                        }
                    }
                }
            }
        `;

        const response = await axios.post('https://gql.hashnode.com/', { query }, {
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        });

        const edges = response.data.data.me.publications.edges;
        if (edges.length > 0) {
            const pubId = edges[0].node.id;
            console.log(`Found Publication ID: ${pubId}`);
            
            // Append to .env
            const envPath = path.join(__dirname, '../.env');
            fs.appendFileSync(envPath, `\nHASHNODE_PUBLICATION_ID=${pubId}\n`);
            console.log('Saved HASHNODE_PUBLICATION_ID to .env');
        } else {
            console.log('No publications found for this user.');
        }

    } catch (e: any) {
        console.error('Error fetching publication:', e.response?.data || e.message);
    }
}

getPublicationId();
