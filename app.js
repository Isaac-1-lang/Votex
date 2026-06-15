// Votex dApp — single script file (IPFS-friendly, no fetch to /build/contracts)
// Update CONTRACT_ADDRESS after deploying on Remix / Truffle / Sepolia.

const CONTRACT_ADDRESS = "0x545e24fe2749fC7824C7390421A7559237778c9b";

// Sepolia testnet — change if you deploy elsewhere
const EXPECTED_CHAIN_ID = "0xaa36a7"; // 11155111

const CONTRACT_ABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [{ internalType: "uint256", name: "_candidateId", type: "uint256" }],
    name: "vote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "candidateId", type: "uint256" },
    ],
    name: "votedEvent",
    type: "event",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "candidates",
    outputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "string", name: "name", type: "string" },
      { internalType: "uint256", name: "voteCount", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "candidatesCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "voters",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
];

// Use web3Client — NOT "web3" (Web3.js CDN may already define a global web3)
let web3Client = null;
let votingContract = null;
let account = null;
let votedFor = null;
let candidates = [];

function showToast(msg, duration = 2800) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}

function renderCandidates() {
  const list = document.getElementById("candidatesList");
  const total = candidates.reduce((sum, c) => sum + c.votes, 0);

  document.getElementById("totalVotes").textContent = total;
  document.getElementById("totalCands").textContent = candidates.length;

  if (!candidates.length) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon">◎</div>
        No candidates on-chain yet.
      </div>`;
    return;
  }

  const sorted = candidates
    .map((c, i) => ({ ...c, origIdx: i }))
    .sort((a, b) => b.votes - a.votes);

  list.innerHTML = sorted
    .map((c, rank) => {
      const pct = total ? Math.round((c.votes / total) * 100) : 0;
      const isWinner = rank === 0 && c.votes > 0;
      const isVoted = votedFor === c.origIdx;

      return `
        <div class="candidate-card${isWinner ? " winner" : ""}">
          <div class="cand-rank">${String(rank + 1).padStart(2, "0")}</div>
          <div class="cand-info">
            <div class="cand-name">${c.name}</div>
            <div class="cand-votes">${c.votes} vote${c.votes !== 1 ? "s" : ""}</div>
          </div>
          <div class="bar-wrap">
            <div class="bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="cand-pct">${pct}%</div>
          <button type="button" class="vote-btn${isVoted ? " voted" : ""}" data-orig-idx="${c.origIdx}">
            ${isVoted ? "Voted" : "Vote"}
          </button>
        </div>`;
    })
    .join("");
}

async function ensureSepoliaNetwork() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });

  if (chainId === EXPECTED_CHAIN_ID) {
    return true;
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: EXPECTED_CHAIN_ID }],
    });
    return true;
  } catch (switchError) {
    if (switchError.code === 4902) {
      showToast("Add Sepolia network in MetaMask, then retry");
    } else {
      showToast("Switch MetaMask to Sepolia testnet");
    }
    return false;
  }
}

async function connectMetaMask() {
  if (typeof window.ethereum === "undefined") {
    showToast("MetaMask not detected");
    return;
  }

  try {
    const onSepolia = await ensureSepoliaNetwork();
    if (!onSepolia) return;

    await window.ethereum.request({ method: "eth_requestAccounts" });

    web3Client = new Web3(window.ethereum);
    const accounts = await web3Client.eth.getAccounts();
    account = accounts[0];

    const btn = document.getElementById("connectBtn");
    btn.classList.add("connected");
    document.getElementById("accountLabel").textContent =
      account.slice(0, 6) + "..." + account.slice(-4);
    document.getElementById("statusLabel").textContent = "Live";

    votingContract = new web3Client.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

    showToast("Wallet connected");
    await loadCandidates();
  } catch (err) {
    console.error("MetaMask connection error:", err);
    showToast("Connection failed — check MetaMask & Sepolia network");
  }
}

async function loadCandidates() {
  if (!votingContract) {
    showToast("Connect wallet first");
    return;
  }

  try {
    const count = await votingContract.methods.candidatesCount().call();

    const fetched = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) =>
        votingContract.methods.candidates(i + 1).call()
      )
    );

    candidates = fetched.map((c, i) => ({
      origIdx: i,
      name: c.name,
      votes: Number(c.voteCount),
    }));

    renderCandidates();
  } catch (err) {
    console.error("Error loading candidates:", err);
    showToast("Failed to load candidates — verify CONTRACT_ADDRESS on Sepolia");
  }
}

async function vote(origIdx) {
  if (!account) {
    showToast("Connect wallet first");
    return;
  }
  if (votedFor !== null) {
    showToast("Already voted this session");
    return;
  }

  const candidateId = origIdx + 1;

  try {
    showToast("Sending transaction…");
    await votingContract.methods.vote(candidateId).send({ from: account });

    votedFor = origIdx;
    showToast("Vote cast on-chain");
    await loadCandidates();
  } catch (err) {
    console.error("Vote error:", err);
    const msg = err.message || String(err);
    showToast(
      msg.includes("Already voted")
        ? "Already voted from this address"
        : "Transaction rejected or already voted"
    );
  }
}

function addCandidate() {
  const inp = document.getElementById("candidateInput");
  const name = inp.value.trim();

  if (!name) {
    showToast("Enter a candidate name");
    return;
  }

  showToast("Extend Voting.sol with a public addCandidate() to enable this");
}

function initApp() {
  document.getElementById("connectBtn").addEventListener("click", connectMetaMask);
  document.getElementById("addCandidateBtn").addEventListener("click", addCandidate);
  document.getElementById("candidateInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addCandidate();
  });

  document.getElementById("candidatesList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-orig-idx]");
    if (!btn) return;
    vote(Number(btn.dataset.origIdx));
  });

  if (window.ethereum) {
    window.ethereum.on("chainChanged", () => window.location.reload());
    window.ethereum.on("accountsChanged", () => window.location.reload());
  }

  renderCandidates();
}

window.addEventListener("load", initApp);
