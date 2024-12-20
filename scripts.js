
let activeNotebookId;
let userId;
// Define baseUrl based on environment
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const baseUrl = isLocalhost ? `${window.location.origin}` : `${window.location.origin}/vn`;

console.log(`Base URL set to: ${baseUrl}`);
function getUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const entries = params.entries();
    const result = {};
    for (const [key, value] of entries) {
        result[key] = value;
    }
    return result;
}
document.addEventListener('DOMContentLoaded', async function () {
    const firebaseConfig = {
        databaseURL: "https://voice-noter-default-rtdb.europe-west1.firebasedatabase.app",
    };
    firebase.initializeApp(firebaseConfig);
    // Retrieve or generate userId
    userId = localStorage.getItem('userId');
    if (!userId) {
        userId = generateUserId();
        console.log("Generated new User ID:", userId);
    }

    // Set up UI components
    setUpUserTooltip();
    observeNoteContainerChanges();
    setUpNoteInput();
    await toggleSpeechKITT();



    // Parse URL parameters
    const urlParams = getUrlParameters();
    const notebookToken = urlParams.notebookToken;
    const sharedUserId = urlParams.userid; // Assuming 'userid' parameter is used for shared notebooks

    if (notebookToken) {
        // Load a single notebook by token in read-only mode
        await loadSingleNotebookByToken(notebookToken);
    } else if (sharedUserId) {
        // Load all shared notebooks for the specified user ID
        await loadSharedUserNotebooks(sharedUserId);
    } else {
        // Default behavior: Load user's own notebooks
        await loadUserNotebooks(userId);
        // **Add this line to update the header with the user's QR code**
        updateHeaderWithUserIDInfo(userId);
    }
      // Attach event listener to "NOVÝ" button
      const createNotebookButton = document.getElementById('createNotebookButton');
      if (createNotebookButton) {
          createNotebookButton.addEventListener('click', function () {
              createNotebook(userId);
          });
      } else {
          console.error('Create Notebook Button not found!');
      }
});

// ======================================
// Loading Functions
// ======================================



function generateUserId() {
    function hashString(str) {
        var hash = 0, i, chr;
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }
    const fingerprint = getDeviceFingerprint();
    const hashedFingerprint = hashString(fingerprint).toString(16); // Convert to hex
    const shortId = hashedFingerprint.substr(0, 8); // Take first 8 characters
    localStorage.setItem('userId', shortId);
    return shortId;
}



async function loadSingleNotebookByToken(token) {
    const notebookId = await getNotebookIdByToken(token);
    if (notebookId) {
        console.log("Notebook ID found:", notebookId);
        activeNotebookId = notebookId; // Set the active notebook ID globally
        loadNotes(notebookId, 'tokenLoad'); // Pass the source to loadNotes
        updateHeaderWithNotebookInfo(token); // Update the header
        hideElements(['notebookTabs', 'createNotebookButton']);

    } else {
        console.error("Invalid notebookToken. No notebook found.");
    }
}
// Helper Functions to Show/Hide Elements
function hideElements(elements) {
    elements.forEach(elementId => {
        const el = document.getElementById(elementId);
        if (el) {
            el.style.display = 'none';
        }
    });
}

function showElements(elements) {
    elements.forEach(elementId => {
        const el = document.getElementById(elementId);
        if (el) {
            el.style.display = 'block';
        }
    });
}

async function loadUserNotebooksByToken(token) {
    const usersRef = firebase.database().ref('users');
    let userId = null;
    // Find the userId associated with the token
    await usersRef.once('value', snapshot => {
        snapshot.forEach(childSnapshot => {
            const userData = childSnapshot.val();
            if (userData.token === token) {
                userId = childSnapshot.key;
            }
        });
    });
    if (userId) {
        console.log("User ID found:", userId);
        loadSharedUserNotebooks(userId);
    } else {
        console.error("Invalid userToken. No user found.");
    }
}
async function loadSharedUserNotebooks(sharedUserId) {
    const userNotebooksRef = firebase.database().ref(`users/${sharedUserId}/notebooks`);
    const snapshot = await userNotebooksRef.once('value');
    const userNotebooks = snapshot.val() || {};
    const notebooksRef = firebase.database().ref(`notebooks`);
    const notebooksSnapshot = await notebooksRef.once('value');
    const notebooks = notebooksSnapshot.val() || {};

    if (!userNotebooks || Object.keys(userNotebooks).length === 0) {
        console.error("No shared notebooks found for this user.");
        alert("No shared notebooks found for the specified user.");
        return;
    }

    // Clear existing tabs and notes
    document.getElementById('notebookTabs').innerHTML = '';
    document.getElementById('notesContainer').innerHTML = '';

    updateHeaderWithUserIDInfo(sharedUserId); // Update the header

    Object.keys(userNotebooks).forEach((notebookId, index) => {
        if (notebooks[notebookId]) {
            let notebookData = notebooks[notebookId];
            let shouldSetActive = index === 0;
            createTab(
                notebookId,
                shouldSetActive,
                notebookData.notes ? Object.keys(notebookData.notes).length : 0,
                notebookData.name || "",
                true // 'true' indicates shared mode (read-only)
            );
        } else {
            console.warn(`Notebook ID ${notebookId} not found in notebooks.`);
        }
    });
}

function updateHeaderWithNotebookInfo(token) {
    const headerElement = document.getElementById('header'); // Assuming you have a header element with this ID
    if (token) {
        headerElement.innerHTML = `<div>nT: ${token}</div>`; 
        let qrCodeContainer = document.getElementById('qrCodeContainer');
        const qrCodeUrl = `${baseUrl}/?notebookToken=${token}`;
 
        qrCodeContainer.innerHTML = '<span class="material-symbols-outlined">qr_code</span>';

        // Add click event to show QR code in a modal when generated
        qrCodeContainer.addEventListener('click', function () {
            const qrModalBody = document.getElementById('qrModalBody');
            qrModalBody.innerHTML = '';
            new QRCode(qrModalBody, {
                text: qrCodeUrl,
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
                // Přidat třídu 'img-fluid' k vytvořenému obrázku
            const qrImage = qrModalBody.querySelector('img');
            if (qrImage) {
                qrImage.classList.add('img-fluid');
            }
            // Add the shared URL and copy button
            const urlElement = document.createElement('div');
            urlElement.className = 'd-flex align-items-center mt-3';
            urlElement.innerHTML = `<span id="sharedUrl" class="me-1">${qrCodeUrl}</span>`;
            qrModalBody.appendChild(urlElement);
            const copyUrlButton = document.createElement('button');
            copyUrlButton.className = 'btn btn-outline-secondary mt-3';
            copyUrlButton.id = 'copyUrlButton';
            copyUrlButton.innerHTML = 'Kopíruj URL <span class="material-symbols-outlined">link</span>';
            qrModalBody.appendChild(copyUrlButton);

            // Add the share button
            const shareButton = document.createElement('button');
            shareButton.className = 'btn btn-primary ms-3 mt-3';
            shareButton.innerHTML = 'Sdílej <span class="material-symbols-outlined">share</span>';
            shareButton.onclick = function () {
                if (navigator.share) {
                    navigator.share({
                        title: 'VNOTE sdílené poznámky',
                        text: 'Omrkni poznámky:',
                        url: qrCodeUrl
                    }).catch((error) => console.error('Chyba sdílení:', error));
                } else {
                    alert('Sdílení není podporováná.');
                }
            };
            qrModalBody.appendChild(shareButton);
            // Copy URL functionality
            document.getElementById('copyUrlButton').addEventListener('click', function () {
                navigator.clipboard.writeText(qrCodeUrl).then(function () {
                    alert('URL zkopírováno do schránky!');
                }).catch(function (error) {
                    console.error('Nemohu zkopírovat:', error);
                });
            });
            // Show the modal
            const modalElement = document.getElementById('qrmodal');
            modalElement.querySelector('.modal-title').innerText = 'notebook Token: ' +token;
            new bootstrap.Modal(modalElement).show();
        });
    } else {
        headerElement.innerHTML = 'Notebook token <br> nenalezen.';
    }
}

// New function to handle userid
function updateHeaderWithUserIDInfo(userId) {
    const headerElement = document.getElementById('header'); // Assuming you have a header element with this ID
    if (userId) {
        headerElement.innerHTML = `<div>UID: ${userId}</div>`;
        let qrCodeContainer = document.getElementById('qrCodeContainer');
        const qrCodeUrl = `${baseUrl}/?userid=${userId}`;

        qrCodeContainer.innerHTML = '<span class="material-symbols-outlined">qr_code</span>';
        // Remove existing event listeners
        const newQrCodeContainer = qrCodeContainer.cloneNode(true);
        qrCodeContainer.parentNode.replaceChild(newQrCodeContainer, qrCodeContainer);
        qrCodeContainer = newQrCodeContainer;
        // Add click event to show QR code in a modal when generated
        qrCodeContainer.addEventListener('click', function () {
            const qrModalBody = document.getElementById('qrModalBody');
            qrModalBody.innerHTML = '';
            new QRCode(qrModalBody, {
                text: qrCodeUrl,
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
                        // Přidat třídu 'img-fluid' k vytvořenému obrázku
            const qrImage = qrModalBody.querySelector('img');
            if (qrImage) {
                qrImage.classList.add('img-fluid');
            }
            // Add the shared URL and copy button
            const urlElement = document.createElement('div');
            urlElement.className = 'd-flex align-items-center mt-3';
            urlElement.innerHTML = `
                <span id="sharedUrl" class="me-1">${qrCodeUrl}</span>                   
            `;
            qrModalBody.appendChild(urlElement);
            const copyUrlButton = document.createElement('button');
            copyUrlButton.className = 'btn btn-outline-secondary mt-3';
            copyUrlButton.id = 'copyUrlButton';
            copyUrlButton.innerHTML = 'Kopíruj URL <span class="material-symbols-outlined">link</span>';
            qrModalBody.appendChild(copyUrlButton);
            // Add the share button
            const shareButton = document.createElement('button');
            shareButton.className = 'btn btn-primary ms-3 mt-3';
            shareButton.innerHTML = 'Sdílej <span class="material-symbols-outlined">share</span>';
            shareButton.onclick = function () {
                if (navigator.share) {
                    navigator.share({
                        title: 'VNOTE sdílené poznámkové bloky',
                        text: 'Omrkni poznámky:',
                        url: qrCodeUrl
                    }).catch((error) => console.error('Chyba sdílení:', error));
                } else {
                    alert('Sdílení není podporováno.');
                }
            };
            qrModalBody.appendChild(shareButton);
            // Copy URL functionality
            document.getElementById('copyUrlButton').addEventListener('click', function () {
                navigator.clipboard.writeText(qrCodeUrl).then(function () {
                    alert('URL zkopírováno do schránky!');
                }).catch(function (error) {
                    console.error('Nemohu zkopírovat:', error);
                });
            });
            // Show the modal
            const modalElement = document.getElementById('qrmodal');
            modalElement.querySelector('.modal-title').innerText = 'UserID: ' + userId;
            new bootstrap.Modal(modalElement).show();
        });
    } else {
        headerElement.innerHTML = 'User ID <br> nenalezen.';
    }
}
async function getNotebookIdByToken(token) {
    const notebooksRef = firebase.database().ref('notebooks');
    try {
        const snapshot = await notebooksRef.once('value');
        const notebooks = snapshot.val() || {};
        for (let notebookId in notebooks) {
            if (notebooks[notebookId] && notebooks[notebookId].token === token) {
                return notebookId;
            }
        }
        return null;
    } catch (error) {
        console.error("Error retrieving notebook by token:", error);
        return null;
    }
}



async function loadUserNotebooks() {
    const userNotebooksRef = firebase.database().ref(`users/${userId}/notebooks`);
    let snapshot = await userNotebooksRef.once('value');
    const userNotebooks = snapshot.val() || {};
    const notebooksRef = firebase.database().ref(`notebooks`);
    let notebooksSnapshot = await notebooksRef.once('value');
    const notebooks = notebooksSnapshot.val() || {};
    if (Object.keys(userNotebooks).length === 0) {
        console.log("No notebooks found, creating one...");
        createNotebook(userId);
    } else {
        let activeTabUID = await getActiveTabUID();
        let foundActiveTab = false;
        Object.keys(userNotebooks).forEach((notebookId, index) => {
            if (notebooks[notebookId]) {
                let notebookData = notebooks[notebookId];
                let shouldSetActive = notebookId === activeTabUID || (!foundActiveTab && index === 0 && !activeTabUID);
                createTab(notebookId, shouldSetActive, notebookData.notes ? Object.keys(notebookData.notes).length : 0, notebookData.name);
                if (shouldSetActive) foundActiveTab = true;
            }
        });
        if (!foundActiveTab && activeTabUID) {
            console.log("Stored active tab ID not found among current notebooks.");
            setFirstTabActive();
        }
    }
}
function createNotebook(userId) {
    // Check the current number of tabs
    const currentTabCount = document.querySelectorAll('#notebookTabs .nav-item').length;
    if (currentTabCount >= 10) {
        alert('You have reached the maximum number of notebooks (10). Please delete an existing notebook before creating a new one.');
        return;
    }
    const newNotebookId = generateCustomNotebookId();
    const newNotebookRef = firebase.database().ref(`notebooks/${newNotebookId}`);
    const notebookData = {
        createdAt: Date.now(),
        token: btoa(Math.random()).substring(0, 12)
    };
    newNotebookRef.set(notebookData, error => {
        if (!error) {
            assignNotebookToUser(userId, newNotebookId);
            createTab(newNotebookId, true);
        } else {
            console.error('Error creating notebook:', error);
        }
    });
}
function assignNotebookToUser(userId, notebookId) {
    const userNotebooksRef = firebase.database().ref(`users/${userId}/notebooks/${notebookId}`);
    userNotebooksRef.set({ id: notebookId }, error => {
        if (error) {
            console.error('Error assigning notebook to user:', error);
        } else {
            console.log('Notebook assigned to user successfully');
        }
    });
} function createTab(notebookId, setActive = false, noteCount = 0, notebookName = "", isShared = false) {
    const tab = document.createElement('li');
    tab.className = 'nav-item d-inline-flex justify-content-between';
    const link = document.createElement('a');
    link.className = 'nav-link';
    link.href = '#';
    link.dataset.notebookId = notebookId;
    link.setAttribute('title', `ID: ${notebookId}`);
    /*const img = document.createElement('img');
    img.src = "note.svg";
    img.alt = "Note Icon";
    img.className = 'ms-2';
    img.style.width = "24px";
    img.style.height = "24px";*/
    const nameLabel = document.createElement('span');
    nameLabel.className = 'notebook-name m-1';
    nameLabel.textContent = notebookName;
    const badge = document.createElement('span');
    badge.className = 'badge bg-primary m-1';
    badge.textContent = noteCount;
    // Create dropdown button and menu only if not in shared mode
    let dropdownBtn, dropdownMenu, shareNotebookItem;
    if (!isShared) {
        dropdownBtn = document.createElement('button');
        dropdownBtn.className = 'btn';
        dropdownBtn.setAttribute('data-bs-toggle', 'dropdown');
        dropdownBtn.ariaExpanded = false;
        dropdownBtn.innerHTML = '⋮';
        dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'dropdown-menu';
        dropdownMenu.appendChild(createDropdownItem('Přejmenuj', () => promptRenameNotebook(notebookId, nameLabel)));
        // Initially, don't pass the token here
        shareNotebookItem = createDropdownItem('Sdílej', () => shareNotebook(notebookId, null));
        dropdownMenu.appendChild(shareNotebookItem); // Added share functionality
        dropdownMenu.appendChild(createDropdownItem('Duplikuj', () => copyNotebook(notebookId)));
        dropdownMenu.appendChild(createDropdownItem('Stáhni jako TXT', () => downloadNotebookAsText(notebookId)));
        dropdownMenu.appendChild(createDropdownItem('Smaž', () => deleteNotebook(notebookId)));
    } else {
        // For shared notebooks, you might want to indicate they are shared
        const sharedLabel = document.createElement('span');
        sharedLabel.className = 'shared-label';
        sharedLabel.textContent = '';
        nameLabel.appendChild(sharedLabel);
    }
    //link.appendChild(img);
    link.appendChild(nameLabel);
    link.appendChild(badge);
    if (!isShared) {
        link.appendChild(dropdownBtn);
        link.appendChild(dropdownMenu);
    }
    tab.appendChild(link);
    // Handle click event differently based on whether it's shared
    link.onclick = function (event) {
        event.preventDefault();
        document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        if (isShared) {
            loadNotes(notebookId, 'tokenLoad', true); // Pass true to indicate read-only
        } else {
            loadNotes(notebookId);
        }
        saveActiveTabUID(notebookId);
    };
    // Fetch and display the token in the title attribute and update the shareNotebook function
    if (!isShared) {
        getNotebookToken(notebookId).then(token => {
            link.setAttribute('title', `ID: ${notebookId}\nToken: ${token}`);
            shareNotebookItem.onclick = function (event) {
                event.preventDefault();
                shareNotebook(notebookId, token);
            };
        }).catch(error => {
            console.error('Error retrieving token:', error);
        });
    }
    document.getElementById('notebookTabs').appendChild(tab);
    if (setActive) {
        link.click();
    }
    return { badge: badge, nameLabel: nameLabel };
}
function shareNotebook(notebookId, token) {
    if (token) {
        const shareableLink = `${baseUrl}/?notebookToken=${token}`;
        redirectToSharePage(shareableLink);
    } else {
        getNotebookToken(notebookId).then(token => {
            if (token) {
                const shareableLink = `${baseUrl}/?notebookToken=${token}`;
                redirectToSharePage(shareableLink);
            } else {
                console.error('No token found for this notebook');
            }
        }).catch(error => {
            console.error('Error generating shareable link:', error);
        });
    }
}

function redirectToSharePage(shareableLink) {
    const sharePageUrl = `${shareableLink}`;
    window.location.href = sharePageUrl;
}

function deleteNotebook(notebookId) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}`);
    notebookRef.remove()
        .then(() => {
            //alert('Notebook successfully deleted.');
            // Remove the tab from the UI
            removeTab(notebookId);
        })
        .catch(error => {
            console.error('Chyba mazání poznámek:', error);
            alert('Nepodařilo se smazat poznámky: ' + error);
        });
}
function removeTab(notebookId) {
    const tabElement = document.querySelector(`a[data-notebook-id="${notebookId}"]`).parentNode;
    if (tabElement) {
        tabElement.parentNode.removeChild(tabElement);
    }
}

async function getNotebookToken(notebookId) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}`);
    try {
        const snapshot = await notebookRef.once('value');
        const notebook = snapshot.val();
        if (notebook && notebook.token) {
            console.log("Existing token found:", notebook.token);
            return notebook.token;
        } else {
            console.error("Token not found for notebook:", notebookId);
            return null;
        }
    } catch (error) {
        console.error("Error retrieving token:", error);
        return null;
    }
}
function downloadNotebookAsText(notebookId) {
    const notesRef = firebase.database().ref(`notebooks/${notebookId}/notes`);
    notesRef.once('value', snapshot => {
        const notes = snapshot.val();
        const allNotesText = Object.keys(notes).map(key => notes[key].content).join('\n');
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(allNotesText));
        element.setAttribute('download', `notebook-${notebookId}.txt`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    })
        .catch(err => {
            alert('Error downloading the notebook: ' + err);
        });
}
function copyNotebook(notebookId) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}`);
    notebookRef.once('value', snapshot => {
        const data = snapshot.val();
        const newNotebookId = generateCustomNotebookId(); // Assuming you have a function to generate IDs
        const newNotebookRef = firebase.database().ref(`notebooks/${newNotebookId}`);
        newNotebookRef.set(data)
            .then(() => {
                //  alert('Notebook copied successfully, new notebook ID: ' + newNotebookId);
                createTab(newNotebookId, true); // Adding new notebook tab to UI
            })
            .catch(error => {
                alert('Failed to copy notebook: ' + error);
            });
    });
}
function shareNotePrompt(notebookId) {
    const noteId = prompt("Enter the note ID to share:");
    if (noteId) {
        shareNoteToken(notebookId, noteId);
    }
}
function shareAllNotebooks(userId) {
    if (userId) {
        const shareableLink = `${baseUrl}/?userid=${userId}`;
        redirectToSharePage(shareableLink);
    } else {
        console.error('User ID not found.');
    }
}


function showShareModal(link, title) {
    const qrModalBody = document.getElementById('qrModalBody');
    qrModalBody.innerHTML = '';
    new QRCode(qrModalBody, {
        text: link,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
    // Add the shared URL and copy button
    const urlElement = document.createElement('div');
    urlElement.className = 'd-flex align-items-center mt-3';
    urlElement.innerHTML = `
        <span id="sharedUrl" class="me-2">${link}</span>                   
    `;
    qrModalBody.appendChild(urlElement);
    const copyUrlButton = document.createElement('button');
    copyUrlButton.className = 'btn btn-outline-secondary mt-3';
    copyUrlButton.id = 'copyUrlButton';
    copyUrlButton.innerHTML = 'Kopíruj URL <span class="material-symbols-outlined">link</span>';
    qrModalBody.appendChild(copyUrlButton);
    const shareButton = document.createElement('button');
    shareButton.className = 'btn btn-primary ms-3 mt-3';
    shareButton.innerHTML = 'Sdílej <span class="material-symbols-outlined">share</span>';
    shareButton.onclick = function () {
        if (navigator.share) {
            navigator.share({
                title: title,
                text: 'Omrkni poznámky:',
                url: link
            }).catch((error) => console.error('Chyba sdílení:', error));
        } else {
            alert('Sdílení není podporováná.');
        }
    };
    qrModalBody.appendChild(shareButton);
    // Copy URL functionality
    document.getElementById('copyUrlButton').addEventListener('click', function () {
        navigator.clipboard.writeText(link).then(function () {
            alert('URL zkopírováno do schránky!');
        }).catch(function (error) {
            console.error('Nemohu zkopírovat:', error);
        });
    });
    // Show the modal
    const modalElement = document.getElementById('qrmodal');
    modalElement.querySelector('.modal-title').innerText = title;
    new bootstrap.Modal(modalElement).show();
}
function shareNoteToken(notebookId, noteId) {
    const noteRef = firebase.database().ref(`notebooks/${notebookId}/notes/${noteId}`);
    noteRef.once('value', snapshot => {
        const note = snapshot.val();
        if (note && note.token) {
            const shareableLink = `${baseUrl}/?noteToken=${note.token}`;
            prompt("Copy this link to share the note:", shareableLink);
        } else {
            console.error('No token found for this note');
        }
    });
}

function generateCustomNotebookId() {
    return [...Array(16)].map(() => Math.floor(Math.random() * 36).toString(36)).join('');
}
// Set up user tooltip function
// Nastavení funkce pro tooltip uživatele
function setUpUserTooltip() {
    const userIcon = document.getElementById('userIcon');
    userIcon.addEventListener('click', function () {
        var deviceFingerprint = getDeviceFingerprint();
        var deviceInfo = getDeviceInfo();
        var infoText = `
            <ol class="list-group list-group-numbered">
                <li class="list-group-item d-flex justify-content-between align-items-start">
                    <div class="ms-2 me-auto">
                        <div class="fw-bold">Uživatelské ID</div>
                        ${localStorage.getItem('userId')}
                    </div>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-start">
                    <div class="ms-2 me-auto">
                        <div class="fw-bold">Aktivní Tab UID</div>
                        ${localStorage.getItem('activeTabUID')}
                    </div>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-start">
                    <div class="ms-2 me-auto">
                        <div class="fw-bold">Otisk zařízení</div>
                        ${deviceFingerprint}
                    </div>
                </li>
        `;

        // Přeložit a přidat další informace z deviceInfo objektu
        for (var key in deviceInfo) {
            if (deviceInfo.hasOwnProperty(key)) {
                var translatedKey = translateDeviceInfoKey(key);
                infoText += `
                <li class="list-group-item d-flex justify-content-between align-items-start">
                    <div class="ms-2 me-auto">
                        <div class="fw-bold">${translatedKey}</div>
                        ${deviceInfo[key]}
                    </div>
                </li>`;
            }
        }
        infoText += '</ol>';

        // Nastavit obsah modalu na sestavené informace
        const userModalBody = document.getElementById('userModalBody');
        userModalBody.innerHTML = infoText;

        // Zobrazit modal s informacemi o uživateli
        new bootstrap.Modal(document.getElementById('usermodal')).show();
    });
}

// Pomocná funkce pro překládání klíčů deviceInfo
function translateDeviceInfoKey(key) {
    const translations = {
        platform: 'Platforma',
        userAgent: 'User Agent',
        language: 'Jazyk',
        resolution: 'Rozlišení',
        colorDepth: 'Hloubka barev',
        timezoneOffset: 'Posun časového pásma'
        // Přidejte další překlady podle potřeby
    };
    return translations[key] || key;
}

function setUpNoteInput() {
    const noteInput = document.getElementById('noteInput');
    noteInput.addEventListener('keydown', function (event) {
        if (event.key === "Enter") {
            addNoteFromInput();
            event.preventDefault();
        }
    });
    noteInput.addEventListener('blur', addNoteFromInput);
}

function setFirstTabActive() {
    let firstTabLink = document.querySelector('.nav-link');
    if (firstTabLink) {
        firstTabLink.click();
    }
}
function loadSingleNotebook(notebookId) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}`);
    notebookRef.once('value', snapshot => {
        if (snapshot.exists()) {
            const notebookData = snapshot.val();
            console.log("Notebook data loaded:", notebookData);
            // Further processing such as displaying notebook data in the UI
        } else {
            console.log("Notebook not found.");
        }
    });
}
function addNoteFromInput() {
    const noteContent = document.getElementById('noteInput').value;
    if (noteContent && activeNotebookId) { // Use the global activeNotebookId
        addNote(noteContent, activeNotebookId);
        document.getElementById('noteInput').value = ''; // Clear the input after adding a note
    }
}
function addNote(content, notebookId, shouldUpdateNoteCount = true, source = '') {
    const newNoteRef = firebase.database().ref(`notebooks/${notebookId}/notes`).push();
    const now = Date.now();
    const noteData = {
        content: content,
        createdAt: now,
        updatedAt: now,
        token: btoa(Math.random()).substring(0, 12) // Generate a token for the note
    };
    newNoteRef.set(noteData, error => {
        if (error) {
            console.error('Failed to add note:', error);
        } else {
            console.log('Note added successfully');
            if (shouldUpdateNoteCount && source !== 'tokenLoad') {
                updateNoteCount(notebookId, 1);
            }
            console.log(`Note added from: ${source}`);
        }
    });
}

function loadNotes(notebookId, source = '', readOnly = false) {
    activeNotebookId = notebookId; // Set the active notebook ID globally
    const notebookNotesRef = firebase.database().ref(`notebooks/${notebookId}/notes`);

    notebookNotesRef.on('value', function (snapshot) {
        const notes = snapshot.val() || {};
        const notesContainer = document.getElementById('notesContainer');
        notesContainer.innerHTML = ''; // Clear existing notes

        Object.keys(notes).forEach(noteId => {
            const note = notes[noteId];

            // Create Note Element
            const noteElement = document.createElement('div');
            noteElement.className = 'note border-bottom';
            noteElement.setAttribute('data-note-id', noteId);
            noteElement.style.display = 'flex';
            noteElement.style.alignItems = 'center';
            noteElement.style.justifyContent = 'space-between';
            noteElement.style.touchAction = 'pan-y'; // Allow vertical scrolling

            // Create Checkbox Container
            const checkboxContainer = document.createElement('label');
            checkboxContainer.className = 'checkbox-container me-1';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'note-checkbox';
            checkbox.checked = note.finished;

            if (!readOnly) {
                checkbox.onchange = function () {
                    toggleNoteFinished(notebookId, noteId, checkbox.checked);
                    noteText.contentEditable = !checkbox.checked;
                };
            } else {
                // Disable the checkbox if in read-only mode
                checkbox.disabled = true;
            }

            const checkmark = document.createElement('span');
            checkmark.className = 'checkmark';
            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(checkmark);

            // Create Note Text
            const noteText = document.createElement('span');
            noteText.textContent = note.content;
            noteText.className = 'note-text flex-grow-1';
            noteText.contentEditable = !note.finished && !readOnly; // Disable editing if readOnly is true
            noteText.setAttribute('data-note-id', noteId);
            noteText.style.marginRight = '10px';

            if (note.finished) {
                noteElement.classList.add('finished');
                noteText.style.textDecoration = 'line-through';
            }

            // Add blur event listener if not read-only
            if (!readOnly) {
                noteText.addEventListener('blur', function () {
                    updateNote(notebookId, noteId, noteText.textContent);
                });
            }

            // Prepare Tooltip Content
            let createdAt = formatDate(new Date(note.createdAt));
            let updatedAt = formatDate(new Date(note.updatedAt));
            let tooltipContent = `Created: ${createdAt}`;
            if (createdAt !== updatedAt) {
                tooltipContent += `\nEdited: ${updatedAt}`;
            }

            // Create Time Icon with Tooltip
            const timeIcon = document.createElement('span');
            timeIcon.className = 'time-icon material-symbols-outlined';
            timeIcon.textContent = 'access_time'; // Google Material Icon for time
            timeIcon.setAttribute('title', tooltipContent);
            timeIcon.style.cursor = 'pointer';

            // Create Delete Button
            /* const deleteBtn = document.createElement('button');
             deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
             deleteBtn.className = 'delete-note btn btn-sm btn-outline-danger ms-2';
             
             if (!readOnly) {
                 deleteBtn.onclick = function () {
                     deleteNote(notebookId, noteId);
                 };
             } else {
                 // Hide the delete button in read-only mode
                 deleteBtn.style.display = 'none';
             }
 */
            // Append Elements to Note Element
            noteElement.appendChild(checkboxContainer);
            noteElement.appendChild(noteText);
            noteElement.appendChild(timeIcon); // Append Time Icon
            //noteElement.appendChild(deleteBtn);

            // Add Touch Event Listeners for Swipe
            addSwipeListeners(noteElement, notebookId, noteId, readOnly);

            // Prepend to Notes Container
            notesContainer.prepend(noteElement);
        });
    })
};
function addSwipeListeners(noteElement, notebookId, noteId, readOnly) {
    let touchStartX = 0;
    let touchCurrentX = 0;
    let isSwiping = false;
    let didSwipe = false; // Flag to track if a swipe occurred
    const swipeThreshold = 100; // Minimum distance in pixels to trigger action
    const maxSwipeDistance = 300; // Maximum swipe distance to prevent excessive translation

    // Reference to the note text for editing purposes
    const noteText = noteElement.querySelector('.note-text');

    // Remove or comment out the touchstart listener on noteText
    // to allow event propagation
    /*
    noteText.addEventListener('touchstart', function(event) {
        event.stopPropagation();
        console.log('Touchstart on noteText');
    }, { passive: true });
    */

    noteElement.addEventListener('touchstart', function (event) {
        if (readOnly) return; // Do not allow swiping in read-only mode
        touchStartX = event.changedTouches[0].screenX;
        touchCurrentX = touchStartX; // Initialize touchCurrentX
        isSwiping = true;
        didSwipe = false; // Reset swipe flag
        console.log('Touchstart on noteElement:', touchStartX);

        // Remove any existing swipe classes
        noteElement.classList.remove('swipe-left', 'swipe-right', 'swiping-left', 'swiping-right');
    }, false);

    noteElement.addEventListener('touchmove', function (event) {
        if (!isSwiping) return;
        touchCurrentX = event.changedTouches[0].screenX;
        let deltaX = touchCurrentX - touchStartX;

        // Limit the swipe distance
        if (deltaX > maxSwipeDistance) deltaX = maxSwipeDistance;
        if (deltaX < -maxSwipeDistance) deltaX = -maxSwipeDistance;

        // Translate the note
        noteElement.style.transform = `translateX(${deltaX}px)`;
        console.log('Touchmove on noteElement:', deltaX);

        // Add visual feedback based on swipe direction
        if (deltaX < 0) {
            // Swiping left
            noteElement.classList.add('swiping-left');
            noteElement.classList.remove('swiping-right');
        } else if (deltaX > 0) {
            // Swiping right
            noteElement.classList.add('swiping-right');
            noteElement.classList.remove('swiping-left');
        }
    }, false);

    noteElement.addEventListener('touchend', function (event) {
        if (!isSwiping) return;
        isSwiping = false;
        let deltaX = touchCurrentX - touchStartX;
        console.log('Touchend on noteElement:', deltaX);

        // Determine if a significant swipe occurred
        if (deltaX <= -swipeThreshold) {
            // Swipe Left: Mark as Finished
            didSwipe = true;
            console.log('Swipe Left detected');
            toggleNoteFinished(notebookId, noteId, true);
        } else if (deltaX >= swipeThreshold) {
            // Swipe Right: Delete Note
            didSwipe = true;
            console.log('Swipe Right detected');
            // Confirm deletion with a slight delay for animation
            setTimeout(() => {
                deleteNote(notebookId, noteId);
            }, 300); // Adjust delay as needed
        } else {
            // Not enough swipe distance: Revert to original position
            noteElement.style.transform = `translateX(0px)`;
            noteElement.classList.remove('swiping-left', 'swiping-right');
            console.log('Swipe not significant, reverting position');
        }
    }, false);

    // Prevent click event if a swipe has occurred
    noteElement.addEventListener('click', function(event) {
        if (didSwipe) {
            // Reset the flag and prevent default action
            didSwipe = false;
            event.preventDefault();
            event.stopPropagation();
            console.log('Click event prevented due to swipe');
            return false;
        }
        // Else, proceed with the click (e.g., editing)
        console.log('Click event on noteElement');
    }, false);
}

function updateNoteCount(notebookId, increment) {
    try {
        const badge = document.querySelector(`a[data-notebook-id="${notebookId}"] .badge`);
        if (badge) {
            let count = parseInt(badge.textContent) || 0;
            badge.textContent = count + increment;
        } else {
            console.error(`Badge for notebook ID ${notebookId} not found.`);
        }
    } catch (error) {
        console.error('Failed to update note count:', error);
    }
}

function updateNote(notebookId, noteId, content) {
    var noteRef = firebase.database().ref(`notebooks/${notebookId}/notes/${noteId}`);
    noteRef.update({
        content: content,
        updatedAt: Date.now()
    }).then(() => {
        console.log('Note updated successfully');
    }).catch(error => {
        console.error('Failed to update note:', error);
    });
}
function deleteNote(notebookId, noteId) {
    var noteRef = firebase.database().ref(`notebooks/${notebookId}/notes/${noteId}`);
    noteRef.remove()
        .then(() => {
            console.log('Note deleted successfully');
            var noteElement = document.querySelector(`div[data-note-id="${noteId}"]`);
            if (noteElement) {
                noteElement.parentNode.removeChild(noteElement);
            }
            updateNoteCount(notebookId, -1); // Decrement the note count
        })
        .catch(error => {
            console.error('Failed to delete note:', error);
        });
}
function toggleNoteFinished(notebookId, noteId, isFinished) {
    var noteRef = firebase.database().ref(`notebooks/${notebookId}/notes/${noteId}`);
    noteRef.update({
        finished: isFinished
    }, error => {
        if (error) {
            console.error('Failed to update note:', error);
        } else {
            console.log('Note updated successfully');
            var noteElement = document.querySelector(`div[data-note-id="${noteId}"]`);
            if (isFinished) {
                noteElement.classList.add('finished');
                noteElement.querySelector('.note-text').contentEditable = 'false';
            } else {
                noteElement.classList.remove('finished');
                noteElement.querySelector('.note-text').contentEditable = 'true';
            }
        }
    });
}
function promptRenameNotebook(notebookId, nameLabel) {
    const currentName = nameLabel.textContent;
    const newName = prompt("Please enter a new name for the notebook:", currentName);
    if (newName && newName.trim() !== "" && newName !== currentName) {
        renameNotebook(notebookId, newName.trim(), nameLabel);
    }
}
function renameNotebook(notebookId, newName, nameLabel) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}`);
    notebookRef.update({ name: newName }).then(() => {
        nameLabel.textContent = newName; // Update the notebook name in the UI
        console.log("Notebook renamed successfully");
    }).catch(error => {
        console.error("Error renaming notebook:", error);
    });
}
function formatDate(date) {
    let day = date.getDate().toString().padStart(2, '0');
    let month = (date.getMonth() + 1).toString().padStart(2, '0'); // Months start at 0!
    let year = date.getFullYear();
    let hours = date.getHours().toString().padStart(2, '0');
    let minutes = date.getMinutes().toString().padStart(2, '0');
    let seconds = date.getSeconds().toString().padStart(2, '0'); // Include seconds
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}
function createDropdownItem(text, action) {
    var item = document.createElement('a');
    item.className = 'dropdown-item';
    item.href = '#';
    item.textContent = text;
    // Assign additional class based on the action text
    if (text.toLowerCase() === 'delete') {
        item.classList.add('dropdown-item-delete');
    }
    item.onclick = function (event) {
        event.preventDefault(); // Prevent the link from triggering a page reload
        action();
    };
    return item;
}
async function toggleSpeechKITT() {
    if (typeof annyang === 'undefined' || typeof SpeechKITT === 'undefined') {
        console.error("Annyang or SpeechKITT is not loaded!");
        return;
    }
    // Initialize SpeechKITT settings once
    SpeechKITT.annyang();
    annyang.setLanguage('cs-CZ'); // Set the desired language
    SpeechKITT.setInstructionsText('Diktuj...');
    SpeechKITT.displayRecognizedSentence(true);

    if (!SpeechKITT.isListening()) {
        SpeechKITT.setStartCommand(() => annyang.start({ continuous: true }));
        SpeechKITT.setAbortCommand(() => annyang.abort());
        SpeechKITT.vroom();
    } else {
        if (annyang.isListening()) {
            SpeechKITT.abortRecognition();
        } else {
            SpeechKITT.startRecognition();
        }
    }


    // Handle voice recognition result
    annyang.addCallback('result', function (phrases) {
        // Assume the first phrase is the most accurate
        let text = phrases[0];
        if (activeNotebookId && text.trim() !== "") {
            addNote(text, activeNotebookId);
            console.log("Added note: ", text);
            SpeechKITT.abortRecognition();
        }
    });
}



function observeNoteContainerChanges() {
    const container = document.getElementById('notesContainer');
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
            }
        });
    });
    observer.observe(container, {
        childList: true, // observe direct children additions or removals
        subtree: true // observe all descendants
    });
}

function exportAllNotebooks() {
    userId = localStorage.getItem('userId'); // Ensure you have the userId stored in local storage
    const userNotebooksRef = firebase.database().ref(`notebooks`);
    userNotebooksRef.once('value', snapshot => {
        const notebooks = snapshot.val();
        if (!notebooks) {
            console.log("No notebooks to export.");
            return;
        }
        Object.keys(notebooks).forEach(notebookId => {
            const notebookData = notebooks[notebookId];
            exportNotebookAsTxt(notebookId, notebookData);
        });
    });
}

function exportNotebookAsTxt(notebookId, notebookData) {
    const notesRef = firebase.database().ref(`notebooks/${notebookId}/notes`);
    notesRef.once('value', notesSnapshot => {
        const notes = notesSnapshot.val();
        let notesContent = `Notebook: ${notebookData.name || 'Unnamed Notebook'}\n`;
        Object.keys(notes).forEach(noteId => {
            const note = notes[noteId];
            notesContent += `${formatDate(new Date(note.createdAt))}\n${note.content}\n`;
        });
        triggerDownload(notesContent, `${notebookData.name || 'Unnamed_Notebook'}-${notebookId}.txt`);
    });
}
function triggerDownload(content, filename) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}
// Utility functions
function getDeviceFingerprint() {
    var navigatorData = window.navigator;
    var screenData = window.screen;
    var userId = [
        navigatorData.platform,
        navigatorData.userAgent.replace(/\d+/g, ""), // Remove digits to minimize version changes
        navigatorData.language,
        screenData.height,
        screenData.width,
        screenData.colorDepth,
        new Date().getTimezoneOffset()
    ].join('|');
    return userId;
}
function getDeviceInfo() {
    var navigatorData = window.navigator;
    var screenData = window.screen;
    var deviceInfo = {
        platform: navigatorData.platform,
        userAgent: navigatorData.userAgent.replace(/\d+/g, ""), // Remove digits to minimize version changes
        language: navigatorData.language,
        resolution: `${screenData.width} x ${screenData.height}`,
        colorDepth: `${screenData.colorDepth}-bit`,
        timezoneOffset: `UTC ${new Date().getTimezoneOffset() / 60}`
    };
    return deviceInfo;
}
async function getActiveTabUID() {
    return localStorage.getItem('activeTabUID');
}
function saveActiveTabUID(uid) {
    localStorage.setItem('activeTabUID', uid);
}
