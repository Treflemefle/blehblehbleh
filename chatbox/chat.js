import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.es.js';
console.log("DOMPurify type:", typeof DOMPurify);
import {
	initializeApp
} from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js';
import {
	getDatabase,
	ref,
	push,
	onChildAdded,
	serverTimestamp,
	query,
	orderByChild,
	limitToLast,
	endBefore,
	startAt,
	get
} from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-database.js';
import {
	getAuth,
	signInAnonymously
} from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js';
// firebase configuration
const firebaseConfig = {

  apiKey: "AIzaSyDF6LImWpGiCKnJ_rv0JpxgWt0n8BR-r-s",

  authDomain: "her-chatbox.firebaseapp.com",

  databaseURL: "https://her-chatbox-default-rtdb.firebaseio.com",

  projectId: "her-chatbox",

  storageBucket: "her-chatbox.firebasestorage.app",

  messagingSenderId: "455592725730",

  appId: "1:455592725730:web:18f36f974a623a63f5e2bb",

  measurementId: "G-NMVCPWD288"

};

// firebase initialization
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
signInAnonymously(auth).then(() => {
	console.log("Signed in anonymously");
}).catch((error) => {
	console.error("Anonymous sign-in failed:", error);
});
const INITIAL_LOAD_LIMIT = 20;
const LOAD_MORE_LIMIT = 15;
const chatMessages = document.getElementById("chat-messages");
const chatContainer = document.getElementById("chat-container");
const messagesRef = ref(db, "messages");
let oldestLoadedKey = null;
let loadingMessages = false;
const loadedMessageKeys = new Set();
console.log('Firebase App Initialized:', app);
console.log('Database Reference:', db);
// username stuff
let username = (localStorage.getItem('chatUsername') || '').trim();
let website = (localStorage.getItem('chatWebsite') || '').trim();
const websiteInput = document.getElementById('website-input');
const usernameInput = document.getElementById('username-input');
const usernameContainer = document.getElementById('username-container');
document.getElementById('set-username-btn').addEventListener('click', setUsername);

function setUsername() {
	const newUsername = usernameInput.value.trim().substring(0, 15);
	if(!/^[a-zA-Z0-9_\- ]{2,15}$/.test(newUsername)) {
		alert('Username must be 2-15 characters, no special characters');
		return;
	}
	console.log('Setting username:', newUsername);
	if(newUsername.length > 0) {
		username = newUsername;
		let rawWebsite = websiteInput.value.trim();
		if(rawWebsite && !/^https?:\/\//i.test(rawWebsite)) {
			rawWebsite = 'https://' + rawWebsite;
		}
		website = rawWebsite;
		localStorage.setItem('chatUsername', username);
		localStorage.setItem('chatWebsite', website);
		console.log('Username set to:', username);
		usernameInput.value = '';
		usernameContainer.classList.add('show-welcome');
		document.getElementById('display-username').textContent = username;
	} else {
		console.log('Invalid username attempt');
		alert('Please enter a valid username!');
		usernameInput.focus();
	}
}

function sanitize(text) {
	return DOMPurify.sanitize(text, {
ALLOWED_TAGS: ['a', 'strong'],
ALLOWED_ATTR: ['href', 'target', 'rel'],
		ALLOWED_URI_REGEXP: /^(https?|ftp|mailto):/i
	});
}

function createMessageElement(messageData) {
	const li = document.createElement("li");
	li.className = "message";
	const ts = messageData.timestamp || Date.now();
	const timestamp = new Date(ts).toLocaleTimeString([], {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
	li.innerHTML = `
    <div class="message-header">
     <span class="username">
  ${messageData.website 
    ? `<a href="${sanitize(messageData.website)}" target="_blank" rel="noopener noreferrer">${sanitize(messageData.username || 'Anonymous')}</a>`
    : sanitize(messageData.username || 'Anonymous')}
</span>
      <span class="timestamp">${timestamp}</span>
    </div>
    <div class="message-text">${convertEmotes(messageData.message)}</div>
  `;
	return li;
}
async function loadMessages(loadOlder = false) {
	if(loadingMessages) return;
	loadingMessages = true;
	let q;
	if(loadOlder && oldestLoadedKey) {
		q = query(messagesRef, orderByChild('timestamp'), endBefore(oldestLoadedKey), limitToLast(LOAD_MORE_LIMIT));
	} else {
		q = query(messagesRef, orderByChild('timestamp'), limitToLast(INITIAL_LOAD_LIMIT));
	}
	try {
		const snapshot = await get(q);
		const messages = [];
		snapshot.forEach((childSnapshot) => {
			const message = {
				key: childSnapshot.key,
				...childSnapshot.val()
			};
			if(!loadedMessageKeys.has(message.key)) {
				messages.push(message);
				loadedMessageKeys.add(message.key);
			}
		});
		console.log("Fetched messages:", messages.length);
		if(messages.length > 0) {
			oldestLoadedKey = messages[0].timestamp;
		}
		if(loadOlder) {
			messages.reverse().forEach(message => {
				const li = createMessageElement(message);
				chatMessages.insertBefore(li, chatMessages.firstChild);
			});
		} else {
			messages.forEach(message => {
				const li = createMessageElement(message);
				chatMessages.appendChild(li);
			});
			requestAnimationFrame(() => scrollToBottom());
			const latestLoadedTimestamp = messages[messages.length - 1].timestamp;
			subscribeToNewMessages(latestLoadedTimestamp);
		}
	} catch (error) {
		console.error("Error loading messages:", error);
	} finally {
		loadingMessages = false;
	}
}

function subscribeToNewMessages(latestTimestamp) {
	const newMessagesQuery = query(messagesRef, orderByChild('timestamp'), startAt(latestTimestamp + 1));
	onChildAdded(newMessagesQuery, (snapshot) => {
		const message = snapshot.val();
		if(!loadedMessageKeys.has(snapshot.key)) {
			const li = createMessageElement({
				...message,
				key: snapshot.key
			});
			chatMessages.appendChild(li);
			loadedMessageKeys.add(snapshot.key);
			requestAnimationFrame(() => scrollToBottom());
		}
	});
}
document.getElementById('load-older-button').addEventListener('click', () => {
	if(!loadingMessages) {
		loadMessages(true);
	}
});
const emojiMap = {};
document.addEventListener('DOMContentLoaded', () => {
	const emojiPicker = document.getElementById('emoji-picker');
	fetch('emoji-picker.html').then(res => res.text()).then(html => {
		emojiPicker.innerHTML = html;
		document.querySelectorAll('#emoji-picker button.emoji').forEach(btn => {
			const code = btn.dataset.code;
			const type = btn.dataset.type || 'large';
			const img = btn.querySelector('img');
			if(code && img?.src) {
				emojiMap[code] = {
					src: img.src,
					type: type
				};
			}
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				const chatInput = document.getElementById('chat-input');
				chatInput.value += code;
				emojiPicker.classList.remove('active');
				chatInput.focus();
			});
		});
	}).catch(err => {
		console.error('Failed to load emoji picker:', err);
	});
});
const escapeRegExp = (string) => {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

function convertEmotes(text) {
	const safeText = sanitize(text);
	// convert URLs
	const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi;
	let result = safeText.replace(urlRegex, url => {
return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
	});
	result = result.replace(/@(\w+)/g, '<strong>@$1</strong>');
	const emojiCodes = Object.keys(emojiMap).sort((a, b) => b.length - a.length);
	for(const code of emojiCodes) {
		const {
			src,
			type
		} = emojiMap[code];
if(type === 'pixel') {
	result = result.replace(
		new RegExp(escapeRegExp(code), 'g'),
		`<img src="${src}" class="emoticon emoticon-pixel" alt="${code}">`
	);
}
	}
	return result;
}
if(username) {
	document.getElementById('display-username').textContent = username;
	usernameContainer.classList.add('show-welcome');
} else {
	usernameContainer.classList.remove('show-welcome');
}
// send message stuff
document.getElementById("send-button").addEventListener("click", function() {
	if(!username) {
		alert('Please set a username first!');
		return;
	}
	const inputField = document.getElementById("chat-input");
	const messageText = inputField.value.trim();
	if(messageText.length > 300) {
		alert('Message too long!');
		return;
	}
	if(messageText) {
		push(messagesRef, {
			username: username,
			website: website,
			message: messageText,
			timestamp: serverTimestamp()
		});
		inputField.value = "";
	}
});

function logContainerStyles() {
	const style = window.getComputedStyle(chatContainer);
	console.log("Container styles:", {
		height: style.height,
		maxHeight: style.maxHeight,
		overflowY: style.overflowY,
		display: style.display,
		position: style.position
	});
}

function forceReflow() {
	chatContainer.offsetHeight;
	requestAnimationFrame(() => scrollToBottom());
}
window.addEventListener('resize', forceReflow);

function scrollToBottom() {
	requestAnimationFrame(() => {
		chatContainer.scrollTop = chatContainer.scrollHeight;
	});
}
loadMessages();
// emoji picker
document.addEventListener('DOMContentLoaded', () => {
	const emojiButton = document.getElementById('emoji-button');
	const emojiPicker = document.getElementById('emoji-picker');
	const chatInput = document.getElementById('chat-input');
	const charCounter = document.getElementById('char-counter');
	// toggle picker
	emojiButton.addEventListener('click', (e) => {
		e.stopPropagation();
		emojiPicker.classList.toggle('active');
	});
	// close picker when clicking outside
	document.addEventListener('click', (e) => {
		if(!emojiPicker.contains(e.target) && e.target !== emojiButton) {
			emojiPicker.classList.remove('active');
		}
	});
	// enter key for sending messages
	chatInput.addEventListener('keydown', function(event) {
		if(event.key === "Enter" && event.ctrlKey) {
			event.preventDefault();
			document.getElementById("send-button").click();
		}
	});
	// character counter
	chatInput.addEventListener('input', () => {
		const currentLength = chatInput.value.length;
		charCounter.textContent = `${currentLength}/300`;
		charCounter.classList.toggle('over-limit', currentLength > 300);
	});
});