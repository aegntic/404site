const https = require("https");

const API_KEY = "pk1_ea88ead2b57e5cd7589676eaf2fde771f63298136980ab1fc76de082299e2c7c";
const SECRET_KEY = "sk1_1941858c3e7be7e75ae46727c26162731166589c6c295d9d070cc05685bbff5b";
const DOMAIN = "4site.pro";

// Vercel's anycast IP
const VERCEL_IP = "76.76.21.21";

async function updateDNSForVercel() {
  console.log("Updating DNS for Vercel deployment...\n");
  
  // First, delete existing A records
  const deleteData = JSON.stringify({
    secretapikey: SECRET_KEY,
    apikey: API_KEY
  });

  // Get current records to find GitHub Pages A records
  const getOptions = {
    hostname: "porkbun.com",
    port: 443,
    path: `/api/json/v3/dns/retrieve/${DOMAIN}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": deleteData.length
    }
  };

  const records = await new Promise((resolve, reject) => {
    const req = https.request(getOptions, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.write(deleteData);
    req.end();
  });

  console.log("Current records retrieved. Updating to Vercel...");

  // Delete old GitHub Pages A records
  const githubIPs = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
  
  for (const record of records.records) {
    if (record.type === "A" && githubIPs.includes(record.content)) {
      console.log(`Deleting GitHub Pages A record: ${record.content}`);
      
      const deleteOptions = {
        hostname: "porkbun.com",
        port: 443,
        path: `/api/json/v3/dns/delete/${DOMAIN}/${record.id}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": deleteData.length
        }
      };

      await new Promise((resolve, reject) => {
        const req = https.request(deleteOptions, (res) => {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => resolve(JSON.parse(data)));
        });
        req.on("error", reject);
        req.write(deleteData);
        req.end();
      });
    }
  }

  // Add Vercel A record
  const createData = JSON.stringify({
    secretapikey: SECRET_KEY,
    apikey: API_KEY,
    name: "",
    type: "A",
    content: VERCEL_IP,
    ttl: "300"
  });

  const createOptions = {
    hostname: "porkbun.com",
    port: 443,
    path: `/api/json/v3/dns/create/${DOMAIN}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": createData.length
    }
  };

  const result = await new Promise((resolve, reject) => {
    const req = https.request(createOptions, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.write(createData);
    req.end();
  });

  console.log("\nDNS Update Complete!");
  console.log("New configuration:");
  console.log(`- A record: @ -> ${VERCEL_IP} (Vercel)`);
  console.log("\nVercel will handle the rest automatically!");
  console.log("\nNext steps:");
  console.log("1. Deploy to Vercel via their CLI or GitHub integration");
  console.log("2. Add 4site.pro as a custom domain in Vercel dashboard");
  console.log("3. Vercel will automatically provision SSL");
}

updateDNSForVercel().catch(console.error);