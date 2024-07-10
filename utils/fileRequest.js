const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const client = require("https");

function download(url, filepath) {
    return new Promise((resolve, reject) => {
        client.get(url, (res) => {
            if (res.statusCode === 200) {
                res.pipe(fs.createWriteStream(filepath))
                    .on('error', reject)
                    .once('close', () => resolve(filepath));
            } else {
                res.resume();
                reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));
            }
        });
    });
}

const uploadImage = async (filePath) => {
    try {
        const form = new FormData();
        form.append('files[]', fs.createReadStream(filePath));

        const response = await axios.post('https://uguu.se/upload', form, {
            headers: form.getHeaders()
        });

        return response.data.files[0].url;
    } catch (error) {
        console.error('Error uploading file:', error);
    }
};

module.exports = { download, uploadImage }