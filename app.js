const fs= require('fs');
const axios= require('axios');
const sharp= require('sharp');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
const { download, uploadImage } = require("./utils/fileRequest");

require('dotenv').config();

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL; // Discord Webhook URL
const API_KEY     = process.env.BUNGIE_API_KEY; // Bungie API Key

const MEMBERSHIP_TYPE = "3"; // 1 = Xbox, 2 = PSN, 3 = Steam,
const MEMBERSHIP_ID   = process.env.BUNGIE_MEMBERSHIP_ID; // Bungie Acc Id
const REQUEST_INTERVAL = 10; // How many minutes between each inventory check

const TRACKED_ITEM_HASHES = [
    2809120022, // Relativism
    266021826,  // Stoicism
    2273643087, // Solipsism
];

const lDiscordHook = new Webhook(WEBHOOK_URL);
const lInventoryFilePath = __dirname + '/data/inventory.json';

async function getInventory() {
    try {
        console.log('/- Checking inventory -/');
        const response = await axios.get(`https://www.bungie.net/Platform/Destiny2/${MEMBERSHIP_TYPE}/Profile/${MEMBERSHIP_ID}/?components=201,302`, {
            headers: {
                'X-API-Key': API_KEY,
            }
        });

        const characterInventories = response.data.Response.characterInventories.data;
        const itemPerks = response.data.Response.itemComponents.perks.data;
        let CurrentInventory = []
        
        // Iterate all characters' inventories to check for tracked items
        for (const characterId in characterInventories) {
            for (const item of characterInventories[characterId].items) {
                if (TRACKED_ITEM_HASHES.includes(item.itemHash)) {
                    CurrentInventory.push(item.itemInstanceId)
                }
            }
        }

        // Create inventory file if it doesn't exist
        if (!fs.existsSync(lInventoryFilePath)) {
            fs.writeFileSync(lInventoryFilePath, JSON.stringify(CurrentInventory, null, 2));
        }

        // Parse last registered inventory
        let last_inventory = JSON.parse(fs.readFileSync(lInventoryFilePath));

        let lNewItemDetected = false;

        // Iterate through current inventory
        for (const item of CurrentInventory) {
            // Check if item is new or not
            if (!last_inventory.includes(item)) {
                console.log('| New item detected !');
                lNewItemDetected = true;
                const perkData = itemPerks[item].perks;
                let perks = [];

                // Iterate through perks
                for (const perk of perkData) {
                    // Fetch perk data (name and icon)
                    const response = await axios.get(`https://www.bungie.net/Platform/Destiny2/Manifest/DestinySandboxPerkDefinition/${perk.perkHash}/`, {
                        headers: {
                            'X-API-Key': API_KEY,
                        }
                    });

                    const perkName = response.data.Response.displayProperties.name;
                    const iconPath = response.data.Response.displayProperties.icon;

                    // check if perkname contains "Sprit of"
                    if (perkName.includes("Spirit of")) {
                        perks.push({
                            "perkName": perkName,
                            "iconPath": iconPath,
                            "perkHash": perk.perkHash,
                        })
                    }
                }

                // Create images folder if does not exist
                if (!fs.existsSync(__dirname + '/assets/perk_images')) {
                    fs.mkdirSync(__dirname + '/assets/perk_images');
                }

                // check if perk image exists by hash id
                for (const perk of perks) {
                    const imagePath = __dirname + `/assets/perk_images/${perk.perkHash}.png`;
                    if (!fs.existsSync(imagePath)) {
                       // Download image & cache it
                       await download(`https://www.bungie.net${perk.iconPath}`, __dirname + `/assets/perk_images/${perk.perkHash}.png`).catch(console.error);
                    }
                }

                // Stitch images together and upload to uguu.se (temporary file uploader)
                const images = [
                    fs.readFileSync(__dirname + `/assets/perk_images/${perks[0].perkHash}.png`),
                    fs.readFileSync(__dirname + `/assets/perk_images/${perks[1].perkHash}.png`),
                ]
                await sharp({
                    create: {
                        width: 96*2 + 75,
                        height: 96,
                        channels: 4,
                        background: { r: 0, g: 176, b: 244, alpha: 0 },
                    },
                })
                .composite(
                    images.map((image, index)=>({
                        input: image,
                        left: (index)*(96 + 75),
                        top: Math.floor(index/100),
                        width: 96,
                        height: 96,
                    }))
                ) 
                .toFile(__dirname + '/output.png');
                
                const embed = new MessageBuilder()
                .setAuthor('New Class Item')
                .addField("Perk 1", perks[0].perkName, true)
                .addField("Perk 2", perks[1].perkName, true)
                .setColor('#dbd0bf')
                .setTimestamp()
                .setImage(await uploadImage(__dirname + '/output.png'));

                console.log('| Sending Webhook embed ...');
                lDiscordHook.send(embed).then(res => {
                    console.log('| Webhook embed sent.');
                })
            }
        }

        // Write the updated inventory to the file
        fs.writeFileSync(lInventoryFilePath, JSON.stringify(CurrentInventory, null, 2));
        if (!lNewItemDetected) {
            console.log('| No new item detected.');
        }
        console.log('/---------------------------/');
    } catch (error) {
        console.error('Error retrieving inventory:', error);
    }
}


const embed = new MessageBuilder()
    .setAuthor('Starting to track exotic class item drop.')
    .setColor('#d1f598')
    .setTimestamp()

lDiscordHook.send(embed).then(r => {
    console.log('Started tracking ...');
})

// Build current inventory before waiting X minutes ti check again
getInventory();
setInterval(getInventory, REQUEST_INTERVAL * 60 * 1000);