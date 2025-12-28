// ==UserScript==
// @name         Steam Market History to Sheets
// @namespace    https://github.com/Raytr0
// @version      1.0
// @description  Syncs Steam Market History to Google Sheets. Adds Killstreakers, Sheens, and Unusual Effects to item names.
// @author       Raytr0
// @match        https://steamcommunity.com/market/
// @match        https://steamcommunity.com/market/myhistory*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIG ---
    const BUTTON_ID = 'market-sync-sheets-btn';
    const BTN_STYLE = "float: right; background: #66c0f4; color: black; padding: 8px 15px; border: none; cursor: pointer; font-weight: bold; border-radius: 2px; margin-left: 10px;";

    // --- HELPER: WEBHOOK URL ---
    function getWebhookUrl() {
        let url = GM_getValue("marketSheetUrl", "");
        if (!url) {
            url = prompt("Paste your Google Web App URL for MARKET History:");
            if (url) GM_setValue("marketSheetUrl", url.trim());
        }
        return url;
    }

    GM_registerMenuCommand("Reset Webhook URL", () => {
        GM_setValue("marketSheetUrl", "");
        alert("URL reset. Reload page and click Sync.");
    });

    // --- HELPER: EXTRACTION ---
    // This digs into Steam's internal "g_rgAssets" to find Sheens/Effects without needing to hover
    function getItemExtras(rowId) {
        // rowId looks like: "history_row_123456_789012"
        // The last number is usually the Asset ID
        const parts = rowId.split('_');
        if (parts.length < 4) return "";
        const assetId = parts[3];

        // Access Steam's global asset object
        const assets = unsafeWindow.g_rgAssets;
        if (!assets) return "";

        let itemData = null;

        // Find the asset. It's hidden under [AppID][ContextID][AssetID]
        // We loop keys because AppID changes per game (440 for TF2, 730 for CSGO)
        for (const appId in assets) {
            for (const contextId in assets[appId]) {
                if (assets[appId][contextId][assetId]) {
                    itemData = assets[appId][contextId][assetId];
                    break;
                }
            }
            if (itemData) break;
        }

        if (!itemData || !itemData.descriptions) return "";

        // Now scan the descriptions for the cool stuff
        let extras = [];

        itemData.descriptions.forEach(desc => {
            const txt = desc.value; // The text description

            // Check for Killstreaker
            if (txt.includes("Killstreaker:")) {
                extras.push(txt.replace("Killstreaker: ", "Kr: ")); // Shortened to "Kr: Flames"
            }
            // Check for Sheen
            else if (txt.includes("Sheen:")) {
                extras.push(txt.replace("Sheen: ", "Sn: ")); // Shortened to "Sn: Team Shine"
            }
            // Check for Unusual Effect
            else if (txt.includes("Unusual Effect:")) {
                extras.push(txt.replace("Unusual Effect: ", "Ef: "));
            }
            // Some Unusuals just say "Effect: Name"
            else if (txt.startsWith("Effect:")) {
                extras.push(txt.replace("Effect: ", "Ef: "));
            }
        });

        if (extras.length > 0) {
            return ` [${extras.join(", ")}]`;
        }
        return "";
    }

    // --- MAIN LOGIC ---
    function scrapeMarket() {
        const rows = document.querySelectorAll('.market_listing_row');
        const transactions = [];

        console.log(`Found ${rows.length} rows`);

        rows.forEach(row => {
            try {
                // 1. Get Row ID (Important for finding Asset ID)
                const rowId = row.id;

                // 2. Action (Sold/Purchased/Listed) & Date
                // This info is often hidden in a combined div
                const combinedDateDiv = row.querySelector('.market_listing_listed_date_combined');
                let rawActionDate = combinedDateDiv ? combinedDateDiv.innerText.trim() : "";

                // Format comes like "Sold: 25 Dec" or "Purchased: 2 Dec"
                let action = "Unknown";
                let date = "";

                if (rawActionDate.includes(":")) {
                    const parts = rawActionDate.split(":");
                    action = parts[0].trim();
                    date = parts[1].trim();
                } else {
                    // Fallback if formatting is weird (e.g. Listings created but not sold)
                    if (row.querySelector('.market_listing_gainorloss').innerText.includes("+")) action = "Sold";
                    else if (row.querySelector('.market_listing_gainorloss').innerText.includes("-")) action = "Purchased";
                    else action = "Listed";

                    const dateDiv = row.querySelector('.market_listing_listed_date');
                    date = dateDiv ? dateDiv.innerText.trim() : "";
                }

                // 3. Game
                const gameDiv = row.querySelector('.market_listing_game_name');
                const game = gameDiv ? gameDiv.innerText.trim() : "Unknown";

                // 4. Item Name
                const nameLink = row.querySelector('.market_listing_item_name');
                let itemName = nameLink ? nameLink.innerText.trim() : "Unknown Item";

                // 5. GET THE EXTRAS (Sheen, Effects)
                const extras = getItemExtras(rowId);
                itemName = itemName + extras;

                // 6. Price
                const priceSpan = row.querySelector('.market_listing_price');
                const price = priceSpan ? priceSpan.innerText.trim() : "";

                transactions.push({
                    date: date,
                    action: action,
                    game: game,
                    item: itemName,
                    price: price
                });

            } catch (e) {
                console.error("Error parsing row:", e);
            }
        });

        return transactions;
    }

    function sendData(data, btn) {
        const url = getWebhookUrl();
        if (!url) return;

        GM_xmlhttpRequest({
            method: "POST",
            url: url,
            data: JSON.stringify(data),
            headers: { "Content-Type": "application/json" },
            onload: function(response) {
                if (response.status === 200 || response.status === 302) {
                    btn.innerText = "Sync Complete!";
                    setTimeout(() => btn.innerText = "Sync to Sheets", 3000);
                } else {
                    btn.innerText = "Error";
                    console.error(response);
                }
            }
        });
    }

    // --- INIT ---
    function init() {
        // Find the "My Market History" header tab to place the button
        const container = document.querySelector('#tabContentsMyMarketHistory');

        if (container && !document.getElementById(BUTTON_ID)) {
            // Find the header inside the container
            const header = container.previousElementSibling || container.querySelector('.market_listing_table_header') || container;

            // Since Market Page layout is tricky, let's put it on the main tab bar if possible, or right above the table
            const tabHeader = document.querySelector('.my_market_header_active');

            const btn = document.createElement('button');
            btn.id = BUTTON_ID;
            btn.innerText = "Sync to Sheets";
            btn.style = BTN_STYLE;

            // Try to append next to the "My Market History" text header
            const realHeader = document.querySelector('#my_market_activetab');
            if(realHeader) {
                realHeader.appendChild(btn);
            } else {
                container.insertBefore(btn, container.firstChild);
            }

            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Stop steam from changing tabs
                btn.innerText = "Scanning...";
                const data = scrapeMarket();

                if (data.length === 0) {
                    alert("No history found visible. Make sure 'My Market History' is open.");
                    btn.innerText = "Sync to Sheets";
                    return;
                }

                btn.innerText = `Syncing ${data.length} items...`;
                sendData(data, btn);
            });
        }
    }

    window.addEventListener('load', init);
    setTimeout(init, 2000); // Extra delay for Steam's slow load
})();