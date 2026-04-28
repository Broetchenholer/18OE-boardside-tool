//to-do: handle bank going out of money

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
let io; // optional for real-time

// Enable JSON body parsing
app.use(express.json());

// Data file path
const DATA_PATH = path.join(__dirname, 'data.json');

// Simple in-memory state with persistence
let state = loadState();

// Optional: setup socket.io for real-time Push (comment out if not desired)
try {
const { Server } = require('socket.io');
io = new Server(http, { path: '/ws' });
io.on('connection', (socket) => {
console.log('Client connected:', socket.id);
socket.emit('state', state);
});
io.on('error', (err) => console.error('Socket error:', err));
// Broadcast helper
function broadcastState() {
if (io) io.emit('state', state);
}
} catch (e) {
io = null;
console.log('Socket.IO not installed; continuing without real-time updates.');
}

function loadState() {
try {
if (fs.existsSync(DATA_PATH)) {
const raw = fs.readFileSync(DATA_PATH, 'utf8');
return JSON.parse(raw);
}
} catch (e) {
console.error('Failed to load state', e);
}
// fallback default structure
return { entities: [], trains: [], transfers: [] };
}

function saveState() {
fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf8');
}

app.get('/state', (req, res) => 
{
  const gameId = req.query.game || state?.currentGame;
  // Use in-memory state
  if (state && state.games && gameId && state.games[gameId]) 
  {
    return res.json(state.games[gameId].state);
  }
  // Fallback: return the whole in-memory state
  res.json(state);
});

function addRevenueHistory (entity, transfer, balance)
{
  if (transfer && transfer.fromId && transfer.toId && transfer.amount)
  {
	if (entity.id === transfer.fromId)
	{
	  const recentHistory =
      {
		"id": transfer.id,
		"change": '-' + transfer.amount,
		"balance": balance
	  };
	  (entity.history = entity.history || []).push(recentHistory);
	} else {
	  const recentHistory =
      {
		"id": transfer.id,
		"change": '+' + transfer.amount,
		"balance": balance
	  };
	  (entity.history = entity.history || []).push(recentHistory);
	}
  } else {
    const recentHistory =
    {
	  "id": transferId,
	  "balance": balance	
    };
    (entity.history = entity.history || []).push(recentHistory);
  }
}

app.post('/transfer', (req, res) => 
{ 
  const { amount, from: fromId, to: toId } = req.body;
  const gameId = state.currentGame; 
  const game = (state.games || {})[gameId];
  
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  const fromEnt = gamestate.entities.find(e => e.id === fromId);
  const toEnt = gamestate.entities.find(e => e.id === toId);
  const bank = gamestate.entities.find(e => e.id === 'bank_main');
  if (!fromEnt || !toEnt) return res.status(400).json({ error: 'Invalid from/to' });
  if (fromEnt.balance < amount && fromEnt.id !== bank.id ) return res.status(400).json({ error: 'Wir brauchen mehr Mineralien!' });

  fromEnt.balance -= amount;
  toEnt.balance += amount;
  const t = 
  { 
    id: 'MoneyTransfer_' + Date.now(),
	fromId: fromId,
	toId: toId,
	amount,
	timestamp: new Date().toISOString(),
	note: `Transfer of ${amount} from ${fromEnt.name} to ${toEnt.name}.`
  };
  addRevenueHistory(fromEnt,t,fromEnt.balance);
  addRevenueHistory(toEnt,t,toEnt.balance);
  (gamestate.transfers = gamestate.transfers || []).push(t);
  

  // Persist full state.json
  saveState();
  if (io) io.emit('state', state);
  res.json({ ok: true, from: fromEnt.name, to: toEnt.name, amount: amount });
});

app.post('/distribute_gains_by_company', (req, res) => 
{
  const { amount, companyId, halfPay, oeRun } = req.body;
  const gameId = state.currentGame;
  const game = (state.games || {})[gameId];
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  if (typeof amount !== 'number') 
  {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (!companyId || !gamestate.entities.find(e => e.id === companyId && (e.type === 'Major' || e.type === 'Minor'))) 
  {
    return res.status(400).json({ error: 'Invalid company' });
  }
  
  const company = gamestate.entities.find(e => e.id === companyId);
  
  //set oe_run flag
  if (company.type === 'Major')
  {
	company.oe_run = oeRun;
  }
  const payouts = [];  
  if ( amount > 0 )
  {	  
    const bank = gamestate.entities.find(e => e.id === 'bank_main');
    if (!bank) return res.status(500).json({ error: 'Bank Main not found' });

    const shares = (gamestate.shares || []).filter(s => s.originCompanyId === companyId);
    
	const possibleOwners = gamestate.entities.filter(e => e.type === 'Player' || e.id === company.id);

	possibleOwners.forEach( pO => 
	{
	  let percentage = 0;
	  shares.filter(s => s.ownerEntityId === pO.id).forEach(s =>
	  {
		if (company.mode === 'Regional')
		{
		  if (s.mode === 'regional')
		  {
			
		    percentage += Math.round(s.percentage *2.5);
		  } else {
			return;
		  }
		} else {
		  percentage += s.percentage;
		}
	  });
	    if (halfPay)
	    {
		  if (pO.type === 'Player' && percentage > 0)
	      {
		    const ownerShare = Math.ceil(Math.round(amount*percentage/100)/2);
		    bank.balance -= ownerShare;
            pO.balance = (pO.balance || 0) + ownerShare;
		    const t = 
		    { 
		      id: 'distribution' + Date.now() + '_' + company.id + '_' + pO.id,
		      fromId: bank.id, 
		      toId: pO.id,
			  companyId: company.id,			
		      amount: ownerShare,		     
		      timestamp: new Date().toISOString(), 
		      note: `Payout for ${company.name} of ${percentage}% / ${ownerShare} to ${pO.name}.`
		    }
		    addRevenueHistory(pO,t,pO.balance);
		    addRevenueHistory(bank,t,bank.balance);
		    gamestate.transfers.push(t); 
	      } else {
		    if (percentage !== 100) percentage +=Math.round((100-percentage)/2);
            const originShare = Math.ceil(amount*percentage/100);
		    bank.balance -= originShare;
            pO.balance = (pO.balance || 0) + originShare;
		    const t = 
		    { 
		      id: 'distribution' + Date.now() + '_' + company.id + '_' + pO.id,
		      fromId: bank.id, 
		      toId: pO.id,
			  companyId: company.id,			
		      amount: originShare,		     
		      timestamp: new Date().toISOString(), 
		      note: `Payout for ${company.name} of ${percentage}% / ${originShare} to ${pO.name}.`
		    }
		    addRevenueHistory(pO,t,pO.balance);
		    addRevenueHistory(bank,t,bank.balance);
		    gamestate.transfers.push(t);
		  }		  
	    } else {
		  if (percentage > 0)
		  {
		    const ownerShare = Math.round(amount*percentage/100);
		    bank.balance -= ownerShare;
            pO.balance = (pO.balance || 0) + ownerShare;
		    const t = 
		    { 
		      id: 'distribution' + Date.now() + '_' + company.id + '_' + pO.id,
		      fromId: bank.id, 
		      toId: pO.id,
		      companyId: company.id,			
		      amount: ownerShare,		     
		      timestamp: new Date().toISOString(), 
		      note: `Payout for ${company.name} of ${percentage}% / ${ownerShare} to ${pO.name}.`
		    }
		    addRevenueHistory(pO,t,pO.balance);
		    addRevenueHistory(bank,t,bank.balance);
		    gamestate.transfers.push(t);
		  }		  
	    }
	});	
	
  } else {
	const t = 
	{ 
	  id: 'dist_' + Date.now() + '_' + company.id,
	  reason: '0 Pound payout, reset of OE_run',
	  timestamp: new Date().toISOString(),
	  note: `0 Pound payout for ${comany.name}, probably reset of OE_run`
	};
	gamestate.transfers.push(t);  
  }
  company.lastRevenue = amount;
  saveState();
  if (io) io.emit('state', state);
  if (io) io.emit('transfer', payouts);

res.json({ ok: true, company: company.name, amount: amount });
});

app.post('/transfer_share', (req, res) => 
{
  const { companyId, shareId, newOwnerId, shareValue } = req.body;
  const gameId = state.currentGame;
  const game = (state.games || {})[gameId];
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  const company = gamestate.entities.find(e => e.id === companyId && (e.type === 'Major' ||  e.type === 'Minor' || e.type === 'Private'));
  if (!company) return res.status(400).json({ error: 'Invalid company' });
  const share = (gamestate.shares || []).find(s => s.id === shareId && s.originCompanyId === companyId);
  if (!share) return res.status(400).json({ error: 'Share not found for this company' });
  const oldOwner = gamestate.entities.find(e => e.id === share.ownerEntityId);
  const newOwner = gamestate.entities.find(e => e.id === newOwnerId);
  if (!oldOwner || !newOwner) return res.status(400).json({ error: 'Invalid owner(s)' });

  // Cost and payer logic:
  // If newOwner is Bank Main, payer is Bank, payee is oldOwner
  // If newOwner is Player, payer is newOwner, payee is oldOwner
  const bank = gamestate.entities.find(e => e.id === 'bank_main');
  const cost = shareValue;

  let payer, payee;
  if (newOwner.id === bank.id) 
  {
    payer = bank;
    payee = oldOwner;
  } else {
    payer = newOwner;
    payee = oldOwner;
  }

  if ((payer.balance || 0) < cost && payer.id !== bank.id) 
  {
    return res.status(400).json({ error: 'Payer cannot cover cost' });
  }

  payer.balance -= cost;
  payee.balance = (payee.balance || 0) + cost;

  share.ownerEntityId = newOwner.id;

  const t = 
  {
    id: 'share_move_' + Date.now() + '_' + share.id,
    fromId: payer.id,
    toId: payee.id,
    amount: cost,
    shareId: share.id,
    timestamp: new Date().toISOString(),
    note: `Share ${share.name} moved from ${payee.name} to ${payer.name} for ${cost}.`
  };
  addRevenueHistory(payer,t,payer.balance);
  addRevenueHistory(payee,t,payee.balance);
  gamestate.transfers.push(t);

  saveState();
  if (io) io.emit('state', state);
  if (io) io.emit('transfer', [t]);

  res.json({ ok: true, transfer: t.note });
});

app.post('/toggle_company_mode', (req, res) => 
{
  const { companyId } = req.body;
  const gameId = state.currentGame;
  const game = (state.games || {})[gameId];
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  const company = gamestate.entities.find(e => e.id === companyId && e.type === 'Major');
  if (!company) return res.status(400).json({ error: 'Invalid major company' });

  // flip between Regional and Major
  const current = company.mode || 'Regional';
  
  if (current === 'Regional')
  {
	next = 'Major';
  } else if ( current === 'Major')
  {
	next = 'National';
  } else {
	next = 'Regional';
  }
  company.mode = next;

  const t = 
  {
	id: 'Toggle_major_mode' + Date.now() + '_' + company.id,
	CompanyId: company.id,
	RegionalMajor: next,
	timestamp: new Date().toISOString(),
	note: `Change of ${company.name}'s mode from ${current} to ${next}.`
  };
  if (!gamestate.transfers) gamestate.transfers = [];
  gamestate.transfers.push(t);
  
  saveState();
  if (io) io.emit('state', state);
  res.json({ ok: true, newMode: next, name: company.name });
});

app.post('/train_buy_side', (req, res) => 
{
  const { trainId, c_price, newOwnerId, sideused } = req.body;
  price = c_price;
  const gameId = state.currentGame;
  const game = (state.games || {})[gameId];
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  if (typeof price !== 'number' || price < 0) 
  {
    return res.status(400).json({ error: 'Invalid price' });
  }
  if (!trainId || !newOwnerId || !sideused) 
  {
	return res.status(400).json({ error: 'Missing required fields' });
  }

  const train = (gamestate.trains || []).find(t => t.id === trainId);
  if (!train) return res.status(400).json({ error: 'Train not found' });

  const currentOwner = gamestate.entities.find(e => e.id === train.ownerEntityId);
  if (!currentOwner) return res.status(500).json({ error: 'Current owner not found' });

  const newOwner = gamestate.entities.find(e => e.id === newOwnerId);
  if (!newOwner) return res.status(400).json({ error: 'New owner not found' });

  // Ensure newOwner is allowed: Bank Main, Major, or Minor
  const allowedTypes = ['Bank', 'Major', 'Minor'];
  const newOwnerType = newOwner.type;
  if (!allowedTypes.includes(newOwnerType))
  {
	return res.status(400).json({ error: 'New owner must be Bank Main, Major, or Minor' });
  }
		
  // New rule: if bank buys and train is not Level 2, force sideused to "both"
  let sideusedFinal = sideused;
  if (newOwner.id === 'bank_main' && train.name !== 'Level 2' && train.name !== 'Pullman') 
  {
	sideusedFinal = 'both';
  }
  
  if (newOwner.mode === 'National')
  {
	  if (currentOwner.id === 'bank_main')
	  {
        price = 0;
	  } else {
	    currentOwner.balance += price;
		bank = gamestate.entities.find(e => e.id === 'bank_main');
		bank.balance -= price;
	  }	
  } else {
    if ((newOwner.balance || 0) < price && newOwner.id !== 'bank_main') 
    {
	  return res.status(400).json({ error: 'New owner cannot afford the price' });
    }

    // Money flow: transfer price from newOwner to currentOwner
  
    newOwner.balance -= price;
    currentOwner.balance = (currentOwner.balance || 0) + price;
  }
  // Update ownership and sideused
  train.ownerEntityId = newOwner.id;
  train.sideused = sideusedFinal;



  // Optional: push a transfer log
  if (newOwner.mode === 'National' && currentOwner.id !== 'bank_main')
  {
	const t = 
    {
	  id: 'train_buy_' + Date.now() + '_' + train.id,
	  fromId: bank.id,
	  toId: currentOwner.id,
	  amount: price,
	  destinationId: newOwner.id,
	  trainId: train.id,
	  sideUsed: sideused,
	  timestamp: new Date().toISOString(),
	  note: `Move ${train.id} from ${currentOwner.name} to ${newOwner.name} for ${price}.`
    };
	addRevenueHistory(currentOwner,t,currentOwner.balance);
	addRevenueHistory(bank,t,bank.balance);
    if (!gamestate.transfers) gamestate.transfers = [];
    gamestate.transfers.push(t);
    if (io) io.emit('transfer', [t]);	
  } else {
    const t = 
    {
	  id: 'train_buy_' + Date.now() + '_' + train.id,
	  fromId: newOwner.id,
	  toId: currentOwner.id,
	  amount: price,
	  trainId: train.id,
	  sideUsed: sideused,
	  timestamp: new Date().toISOString(),
	  note: `Move ${train.id} from ${currentOwner.name} to ${newOwner.name} for ${price}.`
    };
	addRevenueHistory(currentOwner,t,currentOwner.balance);
	addRevenueHistory(newOwner,t,newOwner.balance);
	if (!gamestate.transfers) gamestate.transfers = [];
    gamestate.transfers.push(t);
    if (io) io.emit('transfer', [t]);
  }
  saveState();
  if (io) io.emit('state', state);

  res.json({ ok: true, train: train.id, owner: newOwner.name, price: price, oldOwner: currentOwner.name });
});

app.post('/minor_track_rights', (req, res) => 
{ 
  const { minorId, region } = req.body;
  const gameId = state.currentGame;
  const game = (state.games || {})[gameId];
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  if (!minorId) return res.status(400).json({ error: 'missing minorId' });
  // ensure minor exists 
  const minor = (gamestate.entities || []).find(e => e.id === minorId && e.type === 'Minor');
  const bank = (gamestate.entities || []).find(e => e.id === 'bank_main');
  if (!minor) return res.status(400).json({ error: 'Invalid minor' });
  // store rights (overwrite or append as you prefer)
  
  
  if (region === 'Großbritannien' || region === 'Deutschland/Niederlande/Schweiz')
  {
	price = 40;
  } else if (region === 'Frankreich/Belgien' || region === 'Österreich-Ungarn')
  {
	price = 20;
  } else {
	price = 10;
  }
  
  if ((minor.balance || 0) < price) 
  {
	return res.status(400).json({ error: 'Minor cannot afford the price' });
  }
	  
  minor.track_rights = region;
  minor.balance -= price;
  bank.balance = (bank.balance || 0) + price;
  saveState();
  if (io) io.emit('state', state);
  
  const t = 
  {
	id: 'track_right_' + Date.now() + '_' + minor.id,
	fromId: nminor.id,
	toId: bank.id,
	company: minor.id,
	track_rights: region,
	amount: price,
	timestamp: new Date().toISOString(),
	note: `Set ${minor.name}'s track rights to ${region} for ${price}.`
  };
  addRevenueHistory(minor,t,minor.balance);
  addRevenueHistory(bank,t,bank.balance);
  if (!gamestate.transfers) gamestate.transfers = [];
  gamestate.transfers.push(t);
  if (io) io.emit('transfer', [t]);
  
  res.json({ ok: true, minor: minor.name, region: region });
});

app.post('/marker_sell', (req, res) => {
  const { markerId, newOwnerId } = req.body;
  const gameId = state.currentGame;
  const game = (state.games || {})[gameId];
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  const marker = (gamestate.port_authority_markers || []).find(m => m.id === markerId);
  if (!marker) return res.status(400).json({ error: 'Marker not found' });

  const currentOwner = gamestate.entities.find(e => e.id === marker.ownerEntityId);
  const newOwner = gamestate.entities.find(e => e.id === newOwnerId);
  if (!currentOwner || !newOwner) return res.status(400).json({ error: 'Invalid owner(s)' });

  // Validate new owner type
  const isAllowed = newOwner.id === 'bank_main' || newOwner.id.startsWith('major_');
  if (!isAllowed) return res.status(400).json({ error: 'Invalid new owner' });

  const price = 125;
  if ((newOwner.balance || 0) < price && newOwner.id !== 'bank_main') 
  {
    return res.status(400).json({ error: 'Insufficient funds' });
  }

  // Transfer money
  newOwner.balance -= price;
  currentOwner.balance = (currentOwner.balance || 0) + price;

  // Transfer ownership
  marker.ownerEntityId = newOwner.id;

  saveState();
  if (io) io.emit('state', state);

  const t = 
  {
    id: 'marker_sell_' + Date.now() + '_' + marker.id,
    fromId: newOwner.id,
    toId: currentOwner.id,
    amount: price,
    markerId: marker.id,
    timestamp: new Date().toISOString(),
    note: `${marker.name} sold to ${newOwner.id} for 125.`
  };
  addRevenueHistory(newOwner,t,newOwner.balance);
  addRevenueHistory(currentOwner,t,currentOwner.balance);
  gamestate.transfers = gamestate.transfers || [];
  gamestate.transfers.push(t);
  if (io) io.emit('transfer', [t]);

  res.json({ ok: true, marker: marker.name, newOwner: newOwner.name });
});

app.post('/marker_place_on_board', (req, res) => 
{ 
  const { companyId, tokenId, price } = req.body;
  const gameId = state.currentGame;
  const game = (state.games || {})[gameId];
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  if (!companyId || !tokenId) return res.status(400).json({ error: 'missing fields' });
  // Find the token inside the company's tokens
  const company = (gamestate.entities || []).find(e => e.id === companyId && (e.type === 'Major' || e.type === 'Minor'));
  if (!company) return res.status(400).json({ error: 'Invalid company for token' });

  const tokens = company.tokens || [];
  const token = tokens.find(t => t.id === tokenId);
  if (!token) return res.status(400).json({ error: 'Token not found on that company' });
  const bank = gamestate.entities.find(e => e.id === 'bank_main');
  
  // Determine price default and onboard logic

  const finalPrice = (typeof price === 'number' && price >= 0) ? price : tokenValueOrDefault(token);

  if ((company.balance || 0) < price ) {
    return res.status(400).json({ error: 'Insufficient funds' });
  }
  company.balance -= finalPrice;
  bank.balance =(bank.balance || 0) + finalPrice;
  if (token.onboard === false)
  {
	  token.onboard = true;
  } else {
	  token.onboard = false;
  }
  
  if (token.onboard)
  {
    const t = 
    {
      id: 'token_move_' + Date.now() + '_' + token.id,
      fromId: company.id,
	  toId: bank.id,
      nowOnBoard: token.onboard,
      amount: finalPrice,
      tokenId: token.id,
      timestamp: new Date().toISOString(),
      note: `${company.name}'s ${token.id} moved to board for ${finalPrice}.`
    };
	addRevenueHistory(company,t,company.balance);
    addRevenueHistory(bank,t,bank.balance);
    gamestate.transfers = gamestate.transfers || [];
    gamestate.transfers.push(t);
  } else {
	const t = 
    {
      id: 'token_move_' + Date.now() + '_' + token.id,
      fromId: bank.id,
      toId: company.id,
      nowOnBoard: token.onboard,
      amount: finalPrice,
      tokenId: token.id,
      timestamp: new Date().toISOString(),
      note: `${company.name}'s ${token.id} moved back to company for ${finalPrice}.`
    };
	addRevenueHistory(company,t,company.balance);
    addRevenueHistory(bank,t,bank.balance);
    gamestate.transfers = gamestate.transfers || [];
    gamestate.transfers.push(t);
  }	
	  
  saveState();
  if (io) io.emit('state', state);

  res.json({ ok: true, company: company.name, token: token.id, onboard: token.onboard });
  
});

app.post('/pay_privates', (req, res) => 
{
  const gameId = state.currentGame;
  const game = (state.games || {})[gameId];
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  const bank = gamestate.entities.find(e => e.id === 'bank_main');
  const privates = (gamestate.entities|| []).filter(e => e.type === 'Private' && e.active === true)
  privates.map(privateCompany => 
  {
	const share = gamestate.shares.find(sh => sh.originCompanyId === privateCompany.id);
	if (share.ownerEntityId !== 'bank_main' && privateCompany.revenue) 
	{
	  owner = gamestate.entities.find(e => e.id === share.ownerEntityId);
	  bank.balance -= privateCompany.value/4;
      owner.balance += privateCompany.value/4;
	  console.log(share.id, privateCompany.name,privateCompany.value/4,owner.id);
	  const t = 
	  { 
	    id: 'privatePayout_' + Date.now() + '_' + privateCompany.id,
		fromId: bank.id,
		toId: owner.id, 
		amount: privateCompany.value/4, 
		timestamp: new Date().toISOString(),
		note: `${privateCompany.name} has paid out ${privateCompany.value/4} to ${owner.name}.`
	  };
	  addRevenueHistory(owner,t,owner.balance);
      addRevenueHistory(bank,t,bank.balance);
      gamestate.transfers.push(t);
	}
  });
  
  //pay minor K or its major owner
  
  const minor_k = gamestate.shares.find(sh => sh.id === 'minor_K_share')
  const k_owner = gamestate.entities.find(e => e.id === minor_k.ownerEntityId);
  const minor_k_company = gamestate.entities.find(e => e.id === minor_k.originCompanyId);
  if (k_owner.type === 'Player' || (k_owner.type === 'Major' && k_owner.mode !== 'National'))
  {
	const soldtrains = gamestate.trains.filter(t => t.id === 'train_3_1' || t.id === 'train_4_1' || t.id === 'train_5_1' || t.id === 'train_6_1' || t.id === 'train_7_1');
	if ( soldtrains.find(st => st.id === 'train_7_1').ownerEntityId !== 'bank_main')
	{
	  fee=60;
	} else if (soldtrains.find(st => st.id === 'train_5_1').ownerEntityId !== 'bank_main'){
	  fee=50;
	} else if (soldtrains.find(st => st.id === 'train_5_1').ownerEntityId !== 'bank_main'){
	  fee=40;
	} else {
	  fee=20;
	}
	bank.balance -= fee;
	if (k_owner.type === 'Player')
	{
	  minor_k_company.balance += fee;
	  const t = 
	{ 
	  id: 'Minor_K_Payout_' + Date.now() + '_' + minor_k_company.id, 
	  fromId: bank.id, 
	  toId: minor_k_company.id, 
	  amount: fee, 
	  timestamp: new Date().toISOString(),
	  note: `${minor_k.name} has paid out ${fee} to ${minor_k_company.name}.`
	};
	addRevenueHistory(minor_k_company,t,minor_k_company.balance);
    addRevenueHistory(bank,t,bank.balance);
    gamestate.transfers.push(t);
	}
	else {
      k_owner.balance += fee;
	  const t = 
	{ 
	  id: 'Minor_K_Payout_' + Date.now() + '_' + k_owner.id, 
	  fromId: bank.id, 
	  toId: k_owner.id, 
	  amount: fee, 
	  timestamp: new Date().toISOString(),
	  note: `${minor_k.name} has paid out ${fee} to ${k_owner.name}.`
	};
	addRevenueHistory(k_owner,t,k_owner.balance);
    addRevenueHistory(bank,t,bank.balance);
    gamestate.transfers.push(t);
	}
  }	
		
  saveState();
  if (io) io.emit('state', state);

  res.json({ ok: true });
});

app.post('/deactivate_company', (req, res) => 
{
  const { companyId} = req.body;
  const gameId = state.currentGame;
  const game = (state.games || {})[gameId];
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  if (!companyId) return res.status(400).json({ error: 'missing company' });
  const company = (gamestate.entities || []).find(e => e.id === companyId );
  if (!company) return res.status(400).json({ error: 'Invalid company' });
  if (company.active)
  {
	company.active = false;
	const t = 
	{ 
	  id: 'deactivateCompany_' + Date.now() + '_' + company.id,
	  timestamp: new Date().toISOString(),
	  note: `${company.name} has been deactivated.`
	};
	gamestate.transfers.push(t);
  } else {
	company.active = true;
	const t = 
	{ 
	  id: 'activateCompany_' + Date.now() + '_' + company.id, 
	  timestamp: new Date().toISOString(),
	  note: `${company.name} has been reactivated.`
	};
	gamestate.transfers.push(t);
  }
  
  saveState();
  if (io) io.emit('state', state);

  res.json({ ok: true, active: company.active, name: company.name });
});

function tokenValueOrDefault(tok){
return typeof tok.value === 'number' ? tok.value : 0;
}

app.post('/rust_trains', (req, res) => 
{
  const { trainLvl } = req.body;
  const gameId = state.currentGame;
  const game = (state.games || {})[gameId];
  if (!game) return res.status(400).json({ error: 'No current game' });
  const gamestate = game.state;
  if (!trainLvl) return res.status(400).json({ error: 'wrong trainLvl' });
  const companies = gamestate.entities.filter(e => (e.type === 'Minor' || e.type === 'Major')).filter( e => e.active === true);
  const trains = gamestate.trains.filter( t => t.name === trainLvl);
  
  trains.map(train =>
  {
	console.log(train.id);
	if (train.ownerEntityId !== 'bank_main')
	{	
	  owner = companies.find(c => c.id === train.ownerEntityId);
	  if ( train.rusted === false)
	  {		
		if (owner.type === 'Major' && owner.mode === 'National')
		{
		  train.rusted = true;
		  const t = 
		  { 
		    id: 'rustTrains_' + Date.now() + '_' + train.id, 
			from: owner.id, 
			action: 'rusted and staying at national', 
			timestamp: new Date().toISOString(),
	        note: `${train.id} has been rusted and stays at ${owner.name}.`
		  };
		  gamestate.transfers.push(t);
		} else {
		  train.rusted = true;
		  train.ownerEntityId = 'bank_main';
		  if (train.sides.length === 2)
		  {	  
		    train.sideused = 'both';
		  }
		  const t = 
		  { 
		    id: 'rustTrains_' + Date.now() + '_' + train.id, 
			from: owner.id, 
			action: 'rusted and moved to bank', 
			timestamp: new Date().toISOString(),
			note: `${train.id} has been rusted and moves to bank.`			
		  };
		  gamestate.transfers.push(t);
		}
	  } else {
		train.rusted = false;
		const t = 
		{ 
		  id: 'rustTrains_' + Date.now() + '_' + train.id, 
		  from: owner.id, 
		  action: 'unrusted', 
		  timestamp: new Date().toISOString(),
		  note: `${train.id} has been unrusted.` 
		};
		gamestate.transfers.push(t);
	  }
	} 
  });
  saveState();
  if (io) io.emit('state', state);

  res.json({ ok: true, rusted: trains[0].rusted });
});

function tokenValueOrDefault(tok){
return typeof tok.value === 'number' ? tok.value : 0;
}

// Serve static UI (optional)
app.use('/', express.static(path.join(__dirname, 'public')));

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
console.log('Server listening on http://localhost:',PORT);
// If a data.json existed, load to ensure in-memory state is current
state = loadState();
});

// Helper: relaunch
process.on('SIGINT', () => {
console.log('Shutting down...');
process.exit();
});


// deep clone starter state
function clone(obj) {
return JSON.parse(JSON.stringify(obj));
}


// Route to create a new game from a template
app.post('/games/create', (req, res) => 
{
  const { id, template = 'default', playerNames = [] } = req.body || {};
  if (!id) 
  {
    return res.status(400).json({ error: 'Missing game id' });
  }

  // use in-memory state
  if (!state.games) state.games = {};
  if (state.games[id]) return res.status(400).json({ error: 'Game id already exists' });

  const templates = (state.games && state.games.templates) || {};
  if (!templates[template]) 
  {
    return res.status(400).json({ error: 'Unknown template' });
  }

  // Deep clone starter
  const starter = templates[template]?.state;
  const starterMeta = templates[template]?.meta || {};

  // Clone
  let newState = JSON.parse(JSON.stringify(starter));
  // Apply player name mapping if provided
  const players = (newState.entities || []).filter(e => e.type === 'Player');
  if (playerNames && Array.isArray(playerNames)) 
  {
    playerNames.slice(0, 8).forEach((name, idx) => 
    {
      const p = players[idx];
      if (p) p.name = name;
    });
  }
  // prune unnamed players if desired
  newState = pruneUnnamedPlayers(newState);
  const newGame =
  {
    state: newState,
    meta: clone(starterMeta)
  };

  // Optional: set a readable default meta
  newGame.meta.name = (starterMeta.name || `New Game (${id})`);

  // Attach to games map
  if (!state.games) state.games = {};
  state.games[id] = newGame;

  // Persist the full state
  saveState();

  res.json({ ok: true, id, currentGame: state.currentGame, game: newGame });
});

function pruneUnnamedPlayers(stateObj) 
{ 
  console.log("test1",stateObj);
  const players = (stateObj.entities || []).filter(e => e.type === 'Player');
  const unnamed = players.filter(p => !p.name || p.name.trim() === ''); 
  if (!unnamed.length) return stateObj;
  const pruneSet = new Set(unnamed.map(p => p.id));

  // Remove unnamed players
  stateObj.entities = (stateObj.entities || []).filter(e => !pruneSet.has(e.id));
  console.log("test2",stateObj);
  return stateObj;
}

app.post('/state/setCurrent', (req, res) => 
{
  const { gameId } = req.body;
  // Basic validation
  if (!state.games || !state.games[gameId]) 
  {
    return res.status(400).json({ error: 'Unknown gameId' });
  }
  state.currentGame = gameId;
  saveState();
  res.json({ ok: true, currentGame: state.currentGame });
});

// List available games and current
app.get('/games', (req, res) => 
{
  const games = Object.keys(state.games || {});
  res.json({ games, current: state.currentGame });
});

// Admin HTML serving (optional redundancy)
app.get('/admin', (req, res) => 
{
  res.sendFile(__dirname + '/admin.html'); // if you place admin.html in public
});

app.get('/player', (req, res) => {
const playerId = req.query.playerId;
// Optional: validate
 if (!playerId) return res.status(400).send('Missing playerId');
// If you want, store current player in memory or just pass it to the client
res.sendFile(path.join(__dirname, 'player.html'));
});

app.get('/', (req, res) => {
res.sendFile(path.join(__dirname, 'starter.html')); // or your chosen entry file
});

app.get('/input', (req, res) => {
res.sendFile(path.join(__dirname, '18OE.html')); // or your chosen entry file
});
