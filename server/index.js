const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mukky254:muhidinaliko2006@cluster0.bneqb6q.mongodb.net/kaziDB?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String },
    role: { type: String, enum: ['employer', 'employee'], default: 'employee' },
    location: { type: String },
    skills: [String],
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Job Schema
const jobSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    category: { 
        type: String, 
        enum: ['general', 'agriculture', 'construction', 'domestic', 'driving', 'retail'],
        default: 'general'
    },
    phone: { type: String, required: true },
    whatsapp: { type: String },
    businessType: { type: String, default: 'Individual' },
    employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    employerName: { type: String, required: true },
    salary: { type: String },
    requirements: [String],
    isActive: { type: Boolean, default: true },
    applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now }
});

const Job = mongoose.model('Job', jobSchema);

// Application Schema
const applicationSchema = new mongoose.Schema({
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { 
        type: String, 
        enum: ['pending', 'accepted', 'rejected'], 
        default: 'pending' 
    },
    message: { type: String },
    appliedAt: { type: Date, default: Date.now }
});

const Application = mongoose.model('Application', applicationSchema);

// Auth Middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ message: 'Invalid token' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

// Routes

// User Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, phone, email, role, location } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists with this phone number' });
        }

        // Create new user
        const user = new User({
            name,
            phone,
            email,
            role,
            location
        });

        await user.save();

        // Generate token
        const token = jwt.sign(
            { userId: user._id }, 
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '30d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                location: user.location
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone } = req.body;

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        // Generate token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '30d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                location: user.location
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// Get user profile
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        res.json({
            user: {
                id: req.user._id,
                name: req.user.name,
                phone: req.user.phone,
                email: req.user.email,
                role: req.user.role,
                location: req.user.location
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Job Routes

// Get all jobs
app.get('/api/jobs', async (req, res) => {
    try {
        const { category, location, search, page = 1, limit = 10 } = req.query;
        
        let query = { isActive: true };
        
        if (category && category !== 'all') {
            query.category = category;
        }
        
        if (location) {
            query.location = { $regex: location, $options: 'i' };
        }
        
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { businessType: { $regex: search, $options: 'i' } }
            ];
        }

        const jobs = await Job.find(query)
            .populate('employerId', 'name phone location')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Job.countDocuments(query);

        res.json({
            jobs,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ message: 'Server error fetching jobs' });
    }
});

// Get single job
app.get('/api/jobs/:id', async (req, res) => {
    try {
        const job = await Job.findById(req.params.id)
            .populate('employerId', 'name phone location')
            .populate('applicants', 'name phone location');

        if (!job) {
            return res.status(404).json({ message: 'Job not found' });
        }

        res.json(job);
    } catch (error) {
        console.error('Get job error:', error);
        res.status(500).json({ message: 'Server error fetching job' });
    }
});

// Create job
app.post('/api/jobs', authMiddleware, async (req, res) => {
    try {
        const { title, description, location, category, phone, whatsapp, businessType, salary, requirements } = req.body;

        const job = new Job({
            title,
            description,
            location,
            category,
            phone,
            whatsapp,
            businessType,
            salary,
            requirements,
            employerId: req.user._id,
            employerName: req.user.name
        });

        await job.save();
        
        // Populate the job with employer info
        await job.populate('employerId', 'name phone location');

        res.status(201).json({
            message: 'Job posted successfully',
            job
        });
    } catch (error) {
        console.error('Create job error:', error);
        res.status(500).json({ message: 'Server error creating job' });
    }
});

// Update job
app.put('/api/jobs/:id', authMiddleware, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        
        if (!job) {
            return res.status(404).json({ message: 'Job not found' });
        }

        // Check if user owns the job
        if (job.employerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to update this job' });
        }

        const updatedJob = await Job.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        ).populate('employerId', 'name phone location');

        res.json({
            message: 'Job updated successfully',
            job: updatedJob
        });
    } catch (error) {
        console.error('Update job error:', error);
        res.status(500).json({ message: 'Server error updating job' });
    }
});

// Delete job
app.delete('/api/jobs/:id', authMiddleware, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        
        if (!job) {
            return res.status(404).json({ message: 'Job not found' });
        }

        // Check if user owns the job
        if (job.employerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to delete this job' });
        }

        await Job.findByIdAndDelete(req.params.id);

        res.json({ message: 'Job deleted successfully' });
    } catch (error) {
        console.error('Delete job error:', error);
        res.status(500).json({ message: 'Server error deleting job' });
    }
});

// Get user's jobs
app.get('/api/my-jobs', authMiddleware, async (req, res) => {
    try {
        const jobs = await Job.find({ employerId: req.user._id })
            .populate('applicants', 'name phone location')
            .sort({ createdAt: -1 });

        res.json(jobs);
    } catch (error) {
        console.error('Get my jobs error:', error);
        res.status(500).json({ message: 'Server error fetching your jobs' });
    }
});

// Apply for job
app.post('/api/jobs/:id/apply', authMiddleware, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        
        if (!job) {
            return res.status(404).json({ message: 'Job not found' });
        }

        // Check if already applied
        const existingApplication = await Application.findOne({
            jobId: job._id,
            employeeId: req.user._id
        });

        if (existingApplication) {
            return res.status(400).json({ message: 'You have already applied for this job' });
        }

        // Create application
        const application = new Application({
            jobId: job._id,
            employeeId: req.user._id,
            employerId: job.employerId,
            message: req.body.message
        });

        await application.save();

        // Add to job's applicants
        job.applicants.push(req.user._id);
        await job.save();

        res.status(201).json({
            message: 'Application submitted successfully',
            application
        });
    } catch (error) {
        console.error('Apply job error:', error);
        res.status(500).json({ message: 'Server error applying for job' });
    }
});

// Get job applications
app.get('/api/jobs/:id/applications', authMiddleware, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        
        if (!job) {
            return res.status(404).json({ message: 'Job not found' });
        }

        // Check if user owns the job
        if (job.employerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to view applications' });
        }

        const applications = await Application.find({ jobId: job._id })
            .populate('employeeId', 'name phone location skills')
            .sort({ appliedAt: -1 });

        res.json(applications);
    } catch (error) {
        console.error('Get applications error:', error);
        res.status(500).json({ message: 'Server error fetching applications' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
