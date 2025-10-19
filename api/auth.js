const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'kazi-mashinani-secret-2024';

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

function formatPhoneNumber(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
        return '254' + cleanPhone.substring(1);
    }
    if (!cleanPhone.startsWith('254')) {
        return '254' + cleanPhone;
    }
    return cleanPhone;
}

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const db = await connectToDatabase();

        if (req.method === 'POST' && req.url === '/api/auth/register') {
            // Handle registration
            const { name, phone, email, password, role, location } = req.body;

            if (!name || !phone || !password || !role || !location) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required: name, phone, password, role, location'
                });
            }

            const formattedPhone = formatPhoneNumber(phone);

            // Check if user exists
            const existingUser = await db.collection('users').findOne({
                $or: [
                    { phone: formattedPhone },
                    { email: email?.toLowerCase() }
                ]
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'User already exists with this phone number or email'
                });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);

            // Create user
            const user = {
                name: name.trim(),
                phone: formattedPhone,
                email: email?.toLowerCase()?.trim(),
                password: hashedPassword,
                role,
                location: location.trim(),
                isVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                lastLogin: new Date()
            };

            const result = await db.collection('users').insertOne(user);
            const userId = result.insertedId;

            // Generate token
            const token = jwt.sign(
                { userId: userId.toString() },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            // Remove password from response
            delete user.password;

            res.status(201).json({
                success: true,
                message: 'User registered successfully!',
                token,
                user: {
                    id: userId,
                    ...user
                }
            });

        } else if (req.method === 'POST' && req.url === '/api/auth/login') {
            // Handle login
            const { phone, password } = req.body;

            if (!phone || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number and password are required'
                });
            }

            const formattedPhone = formatPhoneNumber(phone);

            // Find user
            const user = await db.collection('users').findOne({ phone: formattedPhone });
            if (!user) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid phone number or password'
                });
            }

            // Check password
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid phone number or password'
                });
            }

            // Update last login
            await db.collection('users').updateOne(
                { _id: user._id },
                { $set: { lastLogin: new Date() } }
            );

            // Generate token
            const token = jwt.sign(
                { userId: user._id.toString() },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            // Remove password from response
            delete user.password;

            res.json({
                success: true,
                message: 'Login successful!',
                token,
                user: {
                    id: user._id,
                    ...user
                }
            });

        } else {
            res.status(404).json({
                success: false,
                message: 'Endpoint not found'
            });
        }

    } catch (error) {
        console.error('API error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
