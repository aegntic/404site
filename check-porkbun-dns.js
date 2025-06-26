const https = require("https");

const API_KEY = "pk1_ea88ead2b57e5cd7589676eaf2fde771f63298136980ab1fc76de082299e2c7c";
const SECRET_KEY = "sk1_1941858c3e7be7e75ae46727c26162731166589c6c295d9d070cc05685bbff5b";
const DOMAIN = "4site.pro";

// Function to make API request
function porkbunAPI(endpoint, method = "POST") {
  const data = JSON.stringify({
    secretapikey: SECRET_KEY,
    apikey: API_KEY
  });

  const options = {
    hostname: "porkbun.com",
    port: 443,
    path: `/api/json/v3/dns/${endpoint}/${DOMAIN}`,
    method: method,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = "";
      
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      
      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Check DNS records
async function checkDNS() {
  console.log("Checking DNS records for 4site.pro...\n");
  
  try {
    const records = await porkbunAPI("retrieve");
    
    if (records.status === "SUCCESS") {
      console.log("Current DNS Records:");
      console.log("===================");
      
      const githubPages = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
      let hasCorrectA = false;
      let hasCNAME = false;
      
      records.records.forEach(record => {
        console.log(`Type: ${record.type}, Name: ${record.name}, Content: ${record.content}`);
        
        // Check for GitHub Pages A records
        if (record.type === "A" && record.name === "") {
          if (githubPages.includes(record.content)) {
            hasCorrectA = true;
          }
        }
        
        // Check for CNAME
        if (record.type === "CNAME") {
          hasCNAME = true;
        }
      });
      
      console.log("\nGitHub Pages Configuration Check:");
      console.log("================================");
      
      if (hasCorrectA) {
        console.log("✅ A records are correctly configured for GitHub Pages");
      } else {
        console.log("❌ A records need to be configured for GitHub Pages");
        console.log("   Required IPs: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153");
      }
      
      if (hasCNAME) {
        console.log("⚠️  CNAME record found - this may conflict with A records for apex domain");
      }
      
      // Check if we need to add records
      const aRecords = records.records.filter(r => r.type === "A" && r.name === "");
      const hasAllGitHubIPs = githubPages.every(ip => 
        aRecords.some(record => record.content === ip)
      );
      
      if (\!hasAllGitHubIPs) {
        console.log("\n🔧 Need to configure GitHub Pages A records");
      } else {
        console.log("\n✅ DNS is properly configured for GitHub Pages\!");
      }
      
    } else {
      console.log("Error retrieving records:", records.message);
    }
  } catch (error) {
    console.error("Error checking DNS:", error);
  }
}

checkDNS();
EOF < /dev/null
