const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }

    const client = await MongoClient.connect(MONGODB_URI);
    const db = client.db('kaziDB');
    cachedDb = db;
    return db;
}

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const db = await connectToDatabase();

        if (req.method === 'GET' && req.url === '/api/jobs') {
            // Get all jobs
            const jobs = await db.collection('jobs')
                .find({ isActive: true })
                .sort({ createdAt: -1 })
                .toArray();

            res.json({
                success: true,
                jobs
            });

        } else if (req.method === 'POST' && req.url === '/api/jobs') {
            // Create new job
            const jobData = req.body;
            
            const job = {
                ...jobData,
                isActive: true,
                applicants: [],
                views: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await db.collection('jobs').insertOne(job);
            
            res.status(201).json({
                success: true,
                message: 'Job posted successfully!',
                job: {
                    _id: result.insertedId,
                    ...job
                }
            });

        } else {
            res.status(404).json({
                success: false,
                message: 'Endpoint not found'
            });
        }

    } catch (error) {
        console.error('Jobs API error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
