const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;
const renderedImagePath = './rendered.png';

app.use(cors());
app.use(bodyParser.json());

mongoose.connect(process.env.MONGODB_URL);

const visitorSchema = new mongoose.Schema({
    cssbattle_visitor_count: { type: Number, default: 0 },
});

const Visitor = mongoose.model('Visitor', visitorSchema);

// Function to render HTML content to an image using Puppeteer
const renderHTMLToImage = async (htmlContent) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 400, height: 300 });
    await page.setContent(htmlContent);
    await page.screenshot({ path: renderedImagePath });
    await browser.close();
};

// Function to compare two images and return a similarity score
const compareImages = async (imagePath1, imagePath2) => {
    const img1 = PNG.sync.read(await fs.readFile(imagePath1));
    const img2 = PNG.sync.read(await fs.readFile(imagePath2));

    const { width, height } = img1;
    const diff = new PNG({ width, height });

    const numDiffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.1 });

    return (1 - numDiffPixels / (width * height)) * 100;
};

// Function to execute comparison for a given code content and challenge identifier
const executeComparison = async (htmlContent, challengeId) => {
    const targetImagePath = `./challenge/expected_${challengeId}.png`;

    await renderHTMLToImage(htmlContent);
    const score = await compareImages(renderedImagePath, targetImagePath);

    // Cleanup rendered image after comparison
    try {
        await fs.unlink(renderedImagePath);
    } catch (err) {
        console.error(`Error cleaning up rendered image: ${err.message}`);
    }

    return score;
};

app.get('/', async (req, res) => {
    let visitor = await Visitor.findOne({});
    if (!visitor) {
        visitor = new Visitor({ cssbattle_visitor_count: 0 });
        await visitor.save();
    }
    res.json({ cssbattle_visitor_count: visitor.cssbattle_visitor_count });
});

app.post('/increment-visitor', async (req, res) => {
    let visitor = await Visitor.findOne({});
    if (!visitor) {
        visitor = new Visitor({ cssbattle_visitor_count: 1 });
    } else {
        visitor.cssbattle_visitor_count += 1;
    }
    await visitor.save();
    res.json({ cssbattle_visitor_count: visitor.cssbattle_visitor_count });
});

// Endpoint to process HTML content and return similarity score
app.post('/process', async (req, res) => {
    const { html, challenge } = req.body;

    try {
        const score = await executeComparison(html, challenge);
        res.json({ score });
    } catch (error) {
        console.error(`Error processing request: ${error.message}`);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/hello', (req, res) => {
    res.send({message: 'hello world'})
})

// Start the server
app.listen(port, () => {
    console.log(`Server is started on ${port}`);
});