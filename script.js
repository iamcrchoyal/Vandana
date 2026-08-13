import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, get, set, push, update, remove, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyAGcWUM4lqJKmV2Zz2Em3WtI-D0fcQeuzQ",
    authDomain: "vandana-inventory.firebaseapp.com",
    databaseURL: "https://vandana-inventory-default-rtdb.firebaseio.com",
    projectId: "vandana-inventory",
    storageBucket: "vandana-inventory.firebasestorage.app",
    messagingSenderId: "714747540875",
    appId: "1:714747540875:web:dfb72712b485039325eb8e"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app); 
const storage = getStorage(app); 

// ================= OFFLINE SUPPORT LOGIC =================
window.addEventListener('offline', function() {
    document.getElementById('offline-banner').style.display = 'block';
});
window.addEventListener('online', function() {
    document.getElementById('offline-banner').style.display = 'none';
    if(typeof window.showSaaSToast === 'function') window.showSaaSToast("Internet Connection Restored! (इंटरनेट वापस आ गया)");
});

// Firebase Connection State Check
onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() === false && !navigator.onLine) {
        document.getElementById('offline-banner').style.display = 'block';
    }
});
// =========================================================

let allLedgerData = []; let globalCustomers = []; let smartInventory = {}; let allGodownTransfers = []; let allRecycleData = []; let allPendingRequests = [];
let currentPartyName = ""; let currentPartyPhone = ""; let currentPartyKey = ""; let currentEntryData = null; 
window.lastGeneratedEntryData = null;

window.calcValue = ""; window.calcType = "Gave"; window.isEditingEntry = false;
window.currentReportElemId = ""; window.currentReportFilename = ""; 
window.editingBillNo = null; window.editingEntryKey = null; window.editingEntryDate = null;
window.currentTabType = 'Customer'; window.currentTopCustTab = 'current'; window.currentPaymentMode = 'credit';
window.ledgerTotals = { custGive:0, custGet:0, supGive:0, supGet:0 }; window.globalBalances = {}; 
let cropper; let custCropper; let dataLoadCount = 0;

window.pageStack = ['home'];

try { history.pushState(null, null, location.href); window.onpopstate = function () { history.go(1); }; } catch(e) {}

// SAAS TOAST FUNCTION
window.showSaaSToast = function(msg) {
    let toast = document.getElementById('saas-toast');
    if(toast) {
        document.getElementById('saas-toast-msg').innerText = msg;
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 4000);
    }
};

window.addEventListener('DOMContentLoaded', () => {
    // --- NEW AUTH LOGIC STARTS ---
    const googleProvider = new GoogleAuthProvider();
    const MASTER_ADMIN_EMAIL = "c.r.choyal.crc@gmail.com"; 

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // 1. लॉगिन स्क्रीन छुपाएं
            document.getElementById('login-overlay').style.display = 'none'; 
            document.getElementById('user-profile-badge').style.display = 'flex';
            
            // UI UPDATE
            let userName = user.displayName || "User";
            let firstName = userName.split(' ')[0];
            let userInitial = userName.charAt(0).toUpperCase();

            if (document.getElementById('user-name')) document.getElementById('user-name').innerText = userName;
            if (document.getElementById('user-photo') && user.photoURL) document.getElementById('user-photo').src = user.photoURL;

            const hour = new Date().getHours(); 
            let greet = "Good morning";
            if (hour >= 12 && hour < 17) greet = "Good afternoon"; else if (hour >= 17) greet = "Good evening";
            if (document.getElementById('dynamic-greeting')) document.getElementById('dynamic-greeting').innerText = greet + ", " + firstName;

            if (document.getElementById('pm-email-display')) document.getElementById('pm-email-display').innerText = user.email;
            if (document.getElementById('pm-name-display')) document.getElementById('pm-name-display').innerText = "Hi, " + firstName + "!";
            
            if (user.photoURL) {
                if (document.getElementById('pm-avatar-img')) { document.getElementById('pm-avatar-img').src = user.photoURL; document.getElementById('pm-avatar-img').style.display = 'block'; document.getElementById('pm-avatar-text').style.display = 'none'; }
                if (document.getElementById('top-avatar-img')) { document.getElementById('top-avatar-img').src = user.photoURL; document.getElementById('top-avatar-img').style.display = 'block'; document.getElementById('top-avatar-text').style.display = 'none'; }
            } else {
                if (document.getElementById('pm-avatar-text')) { document.getElementById('pm-avatar-text').innerText = userInitial; document.getElementById('pm-avatar-text').style.display = 'block'; document.getElementById('pm-avatar-img').style.display = 'none'; }
                if (document.getElementById('top-avatar-text')) { document.getElementById('top-avatar-text').innerText = userInitial; document.getElementById('top-avatar-text').style.display = 'flex'; document.getElementById('top-avatar-img').style.display = 'none'; }
            }

            // 2. डेटाबेस में यूजर का डेटा सेव/अपडेट करना
            const userRef = ref(db, 'AppUsers/' + user.uid);
            
            get(userRef).then((snapshot) => {
                let assignedRole = "pending";
                let finalPhone = "";
                let finalAddress = "";

                if (!snapshot.exists()) {
                    if (user.email === MASTER_ADMIN_EMAIL) assignedRole = "admin";
                    set(userRef, {
                        name: userName,
                        email: user.email || "",
                        photo: user.photoURL || "",
                        phone: "",     
                        address: "",    
                        role: assignedRole,
                        createdAt: new Date().toISOString()
                    });
                } else {
                    let userData = snapshot.val();
                    assignedRole = userData.role || "pending";
                    if (user.email === MASTER_ADMIN_EMAIL) assignedRole = "admin"; 
                    
                    finalPhone = userData.phone || "";
                    finalAddress = userData.address || "";

                    update(userRef, {
                        name: userName,
                        email: user.email || "",
                        photo: user.photoURL || "",
                        role: assignedRole 
                    });
                }
                
                // AUTO-FILL BUSINESS PROFILE
                if (assignedRole !== "admin") {
                    if (document.getElementById('ap-name')) document.getElementById('ap-name').value = userName;
                    if (document.getElementById('ap-email')) document.getElementById('ap-email').value = user.email || "";
                    if (document.getElementById('ap-phone') && finalPhone) document.getElementById('ap-phone').value = finalPhone;
                    if (document.getElementById('ap-address') && finalAddress) document.getElementById('ap-address').value = finalAddress;
                }

                // STORE GLOBAL USER DATA
                window.currentUserEmail = user.email;
                window.currentUserRole = assignedRole;
                window.currentUserPhone = finalPhone;
                window.currentUserName = userName;
                
                if(typeof applyDataFiltering === 'function') applyDataFiltering();
                if(typeof window.updatePendingAlertUI === 'function') window.updatePendingAlertUI();

                // SHOW POPUP FOR NEW CUSTOMERS
                if (assignedRole === "pending" && (!finalPhone || !finalAddress)) {
                    document.getElementById('new-customer-popup').style.display = 'flex';
                }

                // CALL ROLE-BASED ACCESS
                if(typeof window.applyRoleBasedAccess === 'function') {
                    window.applyRoleBasedAccess(assignedRole);
                }
                
            }).catch(err => console.error("Database Error:", err));

        } else {
            document.getElementById('login-overlay').style.display = 'flex'; 
            document.getElementById('user-profile-badge').style.display = 'none';
        }
    });

    let todayStr = new Date().toISOString().split('T')[0];
    if(document.getElementById('dash-date-picker')) document.getElementById('dash-date-picker').value = todayStr;
    if(document.getElementById('calc-date')) document.getElementById('calc-date').value = todayStr;
    if(document.getElementById('gd-date')) document.getElementById('gd-date').value = todayStr;
    
    try {
        let savedStack = sessionStorage.getItem('v_pageStack');
        if(savedStack) window.pageStack = JSON.parse(savedStack);
    } catch(e){}
    
    window.rawCustomers = [];
    window.rawLedger = [];

    window.applyDataFiltering = function() {
        if (!window.currentUserRole) return;
        let isAdmin = (window.currentUserRole === 'admin');

        // 1. Customers Filter
        if (isAdmin) {
            globalCustomers = [...window.rawCustomers];
        } else {
            globalCustomers = window.rawCustomers.filter(c => 
                (window.currentUserPhone && c.phone === window.currentUserPhone) || 
                (window.currentUserEmail && c.email === window.currentUserEmail) || 
                (window.currentUserName && c.name === window.currentUserName)
            );
        }

        let displayName = "";
        let displayPic = "";
        
        if (isAdmin) {
            displayName = localStorage.getItem('v_adminName') || "Vandana Enterprises";
            displayPic = localStorage.getItem('v_adminPic');
        } else {
            let myCust = globalCustomers.length > 0 ? globalCustomers[0] : null;
            displayName = myCust ? myCust.name : (window.currentUserName || "User");
            displayPic = myCust && myCust.pic ? myCust.pic : "";
        }

        let firstName = isAdmin ? displayName : displayName.trim().split(' ')[0]; 

        const hour = new Date().getHours(); 
        let greetText = "Good morning";
        if (hour >= 12 && hour < 17) greetText = "Good afternoon"; 
        else if (hour >= 17) greetText = "Good evening";
        
        if (document.getElementById('dynamic-greeting')) {
            document.getElementById('dynamic-greeting').innerText = greetText + ", " + firstName;
        }

        if (document.getElementById('pm-email-display')) document.getElementById('pm-email-display').innerText = displayName;
        if (document.getElementById('user-name')) document.getElementById('user-name').innerText = firstName;

        if (displayPic) {
            if (document.getElementById('pm-avatar-img')) { document.getElementById('pm-avatar-img').src = displayPic; document.getElementById('pm-avatar-img').style.display = 'block'; }
            if (document.getElementById('pm-avatar-text')) document.getElementById('pm-avatar-text').style.display = 'none';
            if (document.getElementById('top-avatar-img')) { document.getElementById('top-avatar-img').src = displayPic; document.getElementById('top-avatar-img').style.display = 'block'; }
            if (document.getElementById('top-avatar-text')) document.getElementById('top-avatar-text').style.display = 'none';
        }

        // 3. Ledger Book Filter
        let myCustName = displayName;
        if (isAdmin) {
            allLedgerData = [...window.rawLedger];
        } else {
            allLedgerData = window.rawLedger.filter(e => e.name === myCustName);
        }

        renderCustomerList(globalCustomers);
        calculateGrandTotals();
        if (document.getElementById('ledger-deep-page').classList.contains('active')) {
            renderLedgerEntries(currentPartyName);
        }
    }

    try {
        onValue(ref(db, 'BusinessProfile'), (snapshot) => {
            let data = snapshot.val();
            if(data) {
                localStorage.setItem('v_adminName', data.name || "Vandana Enterprises");
                if(data.phone) localStorage.setItem('v_adminPhone', data.phone);
                if(data.email) localStorage.setItem('v_adminEmail', data.email);
                if(data.gst) localStorage.setItem('v_adminGst', data.gst);
                if(data.address) localStorage.setItem('v_adminAddr', data.address);
                if(data.upi) localStorage.setItem('v_adminUpi', data.upi);
                if(data.pic) localStorage.setItem('v_adminPic', data.pic);
                
                loadAdminProfile();
                if(typeof window.applyDataFiltering === 'function') window.applyDataFiltering();
            }
        });

        onValue(ref(db, 'Inventory'), (snapshot) => { 
            smartInventory = snapshot.val() || {}; 
            renderInventoryList(); 
            updatePosShades(); 
            checkRestore(); 
        });
        
        onValue(ref(db, 'Customers'), (snapshot) => { 
            let data = snapshot.val() || {}; 
            window.rawCustomers = Object.keys(data).map(key => ({ key: key, ...data[key] })); 
            if(typeof window.applyDataFiltering === 'function') window.applyDataFiltering();
            setupPOSAutocomplete(); 
            checkRestore(); 
        });

        window.allAppUsers = [];
        onValue(ref(db, 'AppUsers'), (snapshot) => { 
            let data = snapshot.val() || {}; 
            window.allAppUsers = Object.keys(data).map(key => ({ uid: key, ...data[key] })); 
            if(document.getElementById('manage-users-page') && document.getElementById('manage-users-page').classList.contains('active')) {
                if(typeof renderManageUsers === 'function') renderManageUsers();
            }
        });
        
        window.godownLimit = 300;
        window.godownUnsubscribe = null;

        window.initGodownListener = function() {
            if(window.godownUnsubscribe) window.godownUnsubscribe(); 
            const godownQuery = query(ref(db, 'GodownTransfers'), limitToLast(window.godownLimit));
            window.godownUnsubscribe = onValue(godownQuery, (snapshot) => { 
                let data = snapshot.val() || {}; 
                allGodownTransfers = Object.keys(data).map(key => ({ key: key, ...data[key] })).reverse(); 
                renderGodownHistory(); 
                renderInventoryList(); 
                checkRestore(); 
                let btn = document.getElementById('godown-load-more-btn');
                if(btn) btn.style.display = (allGodownTransfers.length >= window.godownLimit) ? 'inline-block' : 'none';
            });
        }
        window.initGodownListener(); 

        window.loadMoreGodown = function() {
            window.godownLimit += 300; 
            let btn = document.getElementById('godown-load-more-btn');
            if(btn) btn.innerText = "लोड हो रहा है...";
            window.initGodownListener();
            setTimeout(() => { if(btn) btn.innerText = "⬇️ पुरानी एंट्रीज़ लोड करें (Load More)"; }, 1000);
        }
        
        onValue(ref(db, 'Ledger'), (snapshot) => { 
            let data = snapshot.val() || {}; 
            window.rawLedger = Object.keys(data).map(key => ({ key: key, ...data[key] }));
            window.rawLedger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            if(typeof window.applyDataFiltering === 'function') window.applyDataFiltering();
            renderInventoryList(); 
            checkRestore(); 
        });
        
        const recycleQuery = query(ref(db, 'RecycleBin'), limitToLast(100));
        onValue(recycleQuery, (snapshot) => { 
            let data = snapshot.val() || {}; 
            allRecycleData = Object.keys(data).map(key => ({ key: key, ...data[key] })).reverse(); 
            renderRecycleBin(); 
        });
        
        window.updatePendingAlertUI = function() {
            let badge = document.getElementById('admin-pending-alert');
            let countTxt = document.getElementById('pending-req-count');
            if(badge && countTxt) {
                if(allPendingRequests.length > 0 && window.currentUserRole === 'admin') {
                    badge.style.display = 'flex';
                    countTxt.innerText = `${allPendingRequests.length} Pending Request${allPendingRequests.length > 1 ? 's' : ''}`;
                } else {
                    badge.style.display = 'none';
                }
            }
        };

        const pendingQuery = query(ref(db, 'PendingRequests'), limitToLast(100));
        onValue(pendingQuery, (snapshot) => { 
            let data = snapshot.val() || {}; 
            allPendingRequests = Object.keys(data).map(key => ({ key: key, ...data[key] })).reverse(); 
            window.updatePendingAlertUI();
            if(document.getElementById('verification-page') && document.getElementById('verification-page').classList.contains('active')) {
                if(typeof renderPendingRequests === 'function') renderPendingRequests();
            }
        });
    } catch (error) {}

    // 🌟 SMART CUSTOMER AUTOCOMPLETE
    document.getElementById('inv-party').addEventListener('change', function(e) { 
        let val = e.target.value.trim().toLowerCase(); 
        let cust = globalCustomers.find(c => c.name.toLowerCase() === val); 
        if(cust) { 
            e.target.value = cust.name; 
            if(cust.phone) document.getElementById('inv-phone').value = cust.phone; 
        } 
    });

    document.getElementById('cp-scroll-content').addEventListener('scroll', function() {
        let st = this.scrollTop;
        let headerGroup = document.getElementById('cp-header-group');
        let mainTitle = document.getElementById('cp-main-title');
        let bigAvatarWrap = document.getElementById('cp-big-avatar-wrap');
        
        let maxScroll = 50;
        let progress = Math.min(st / maxScroll, 1);
        
        headerGroup.style.opacity = progress;
        headerGroup.style.transform = `translateY(${(1 - progress) * 10}px)`;
        mainTitle.style.opacity = 1 - progress;

        if(bigAvatarWrap) {
            bigAvatarWrap.style.opacity = 1 - progress;
            bigAvatarWrap.style.transform = `scale(${1 - (progress * 0.2)})`;
            if(progress > 0.9) bigAvatarWrap.style.pointerEvents = 'none';
            else bigAvatarWrap.style.pointerEvents = 'auto';
        }
    });

    let lastScrollTop = 0;
    document.querySelector('.main-wrapper').addEventListener('scroll', function() {
        let st = this.scrollTop;
        if(st > 10) { document.getElementById('main-app-bar').classList.add('scrolled'); } else { document.getElementById('main-app-bar').classList.remove('scrolled'); }
        if(st > lastScrollTop && st > 50) { document.getElementById('bottom-nav-bar').classList.add('hidden-by-scroll'); } else { document.getElementById('bottom-nav-bar').classList.remove('hidden-by-scroll'); }
        lastScrollTop = st <= 0 ? 0 : st;
    });
    loadAdminProfile();
});

function checkRestore() {
    dataLoadCount++;
    if(dataLoadCount === 4) { 
        let savedPage = sessionStorage.getItem('v_activePage');
        if(savedPage === 'ledger-deep-page') {
            let pName = sessionStorage.getItem('v_currentPartyName');
            let pPhone = sessionStorage.getItem('v_currentPartyPhone');
            if(pName) { currentPartyName = pName; openLedgerDetail(pName, pPhone); openPage('ledger-deep-page', true); }
        } else if(savedPage === 'customer-profile-page') {
            let pName = sessionStorage.getItem('v_currentPartyName');
            if(pName) { currentPartyName = pName; openCustomerProfile(); openPage('customer-profile-page', true); }
        } else if(savedPage === 'entry-details-page') {
            let eKey = sessionStorage.getItem('v_currentEntryKey');
            if(eKey) { openEntryDetails(eKey); openPage('entry-details-page', true); }
        } else if(savedPage && savedPage !== 'home') {
            openPage(savedPage, true);
        }
    }
}

document.getElementById('dash-date-picker').addEventListener('change', function(e) { calculateGrandTotals(); });

window.loginWithGoogle = function() {
    const googleProvider = new GoogleAuthProvider(); 
    let loginBtn = document.getElementById('google-login-btn');
    loginBtn.innerHTML = "Checking...";
    
    signInWithPopup(auth, googleProvider)
        .then((result) => {
            const user = result.user;
            alert("Welcome " + user.displayName + "! (लॉगिन सफल)");
            document.getElementById('login-overlay').style.display = 'none';
            loginBtn.innerHTML = `<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" style="width: 24px;"> Sign in with Google`;
        })
        .catch((error) => {
            console.error(error);
            alert("लॉगिन कैंसल हो गया या एरर आया।");
            loginBtn.innerHTML = `<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" style="width: 24px;"> Sign in with Google`;
        });
}

window.updateGreeting = function() {
    const hour = new Date().getHours(); let greeting = "Good morning";
    if (hour >= 12 && hour < 17) greeting = "Good afternoon"; else if (hour >= 17) greeting = "Good evening";
    let pName = localStorage.getItem('v_adminName') || "Admin";
    document.getElementById('dynamic-greeting').innerText = greeting + ", " + (pName.split(' ')[0] || "Admin");
}

function updateBottomNavVisibility(pageId) {
    if(pageId === 'home') { document.getElementById('bottom-nav-bar').classList.remove('hidden-by-page'); } else { document.getElementById('bottom-nav-bar').classList.add('hidden-by-page'); }
}

const allPagesList = ['items-page', 'parties-page', 'cashbook-page', 'pos-page','mybills-page', 'godown-page', 'invoices-page', 'recycle-page', 'absent-page', 'report-preview-page', 'admin-profile-page', 'thread-stock-page', 'zari-stock-page', 'cording-stock-page', 'nylon-stock-page', 'bobbin-stock-page', 'lowstock-page', 'ledger-deep-page', 'customer-profile-page', 'entry-details-page', 'calculator-page', 'verification-page', 'payment-screen-page', 'manage-users-page', 'home'];

window.openPage = function(id, isBack = false) { 
    if(!isBack && window.pageStack[window.pageStack.length-1] !== id) {
        window.pageStack.push(id);
    }
    allPagesList.forEach(p => { if(document.getElementById(p)) document.getElementById(p).classList.remove('active'); }); 
    sessionStorage.setItem('v_activePage', id);
    sessionStorage.setItem('v_pageStack', JSON.stringify(window.pageStack));
    updateBottomNavVisibility(id); 
    let targetElem = document.getElementById(id);
    if(targetElem) targetElem.classList.add('active'); 
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if(id === 'home') document.getElementById('nav-btn-home')?.classList.add('active');
    if(id === 'items-page') document.getElementById('nav-btn-inventory')?.classList.add('active');
    
    if(id === 'parties-page' || id === 'ledger-deep-page') document.getElementById('nav-btn-ledger')?.classList.add('active');
    
    if(id === 'mybills-page') { 
        document.getElementById('nav-btn-mybills')?.classList.add('active'); 
        if(typeof renderMyBillsList === 'function') renderMyBillsList(); 
    }
}

window.navTo = function(pageId, element) {
    window.pageStack = ['home'];
    if(pageId === 'parties-page' && window.currentUserRole !== 'admin') {
        let myName = globalCustomers.length > 0 ? globalCustomers[0].name : window.currentUserName;
        let myPhone = window.currentUserPhone || "";
        window.pageStack.push('ledger-deep-page');
        openLedgerDetail(myName, myPhone);
        return;
    }
    if(pageId !== 'home') window.pageStack.push(pageId);
    openPage(pageId, true);
}

window.closePage = function(id) { 
    if(window.pageStack && window.pageStack.length > 1) {
        if(window.pageStack[window.pageStack.length - 1] === id) {
            window.pageStack.pop(); 
        }
        let prevPage = window.pageStack[window.pageStack.length - 1] || 'home';
        openPage(prevPage, true);
    } else {
        navTo('home', null);
    }
}

window.goHome = function() { navTo('home', null); }
window.openSidebar = function() { document.getElementById('sidebar').classList.add('active'); document.getElementById('sidebar-overlay').style.display = 'block'; document.body.classList.add('sidebar-locked'); }
window.closeSidebar = function() { document.getElementById('sidebar').classList.remove('active'); document.getElementById('sidebar-overlay').style.display = 'none'; document.body.classList.remove('sidebar-locked'); }
window.openProfileModal = function() { document.getElementById('profile-modal-overlay').style.display='block'; document.getElementById('profile-modal').style.display='flex'; }
window.closeProfileModal = function() { document.getElementById('profile-modal-overlay').style.display='none'; document.getElementById('profile-modal').style.display='none'; }
window.openAdminProfile = function() { closeSidebar(); closeProfileModal(); openPage('admin-profile-page'); }

window.openSelfCustomerProfile = function() {
    closeProfileModal();
    closeSidebar();
    if (window.currentUserRole === 'admin') {
        openPage('admin-profile-page');
    } else {
        let myCust = globalCustomers.length > 0 ? globalCustomers[0] : null;
        let myName = myCust ? myCust.name : window.currentUserName;
        if (myName) {
            currentPartyName = myName;
            openCustomerProfile();
        } else {
            if (typeof window.showSaaSToast === 'function') window.showSaaSToast("Customer profile not found.");
        }
    }
}

window.openDpViewer = function(src) {
    if(!src) return;
    document.getElementById('dp-viewer-img').src = src;
    document.getElementById('dp-viewer').style.display = 'flex';
    setTimeout(()=> document.getElementById('dp-viewer').classList.add('active'), 10);
}
window.closeDpViewer = function() {
    document.getElementById('dp-viewer').classList.remove('active');
    setTimeout(()=> document.getElementById('dp-viewer').style.display = 'none', 200);
}

window.toggleInvCard = function(el) { 
    let isExpanded = el.classList.contains('expanded');
    let parentGrid = el.closest('.inventory-grid');
    if(parentGrid) {
        parentGrid.querySelectorAll('.inv-card.expanded').forEach(c => c.classList.remove('expanded'));
    }
    if(!isExpanded) {
        el.classList.add('expanded');
    }
}

window.openReportModal = function(type) { document.getElementById('report-modal-type').value = type; document.getElementById('report-modal-title').innerText = type === 'ledger' ? 'Account Statement' : 'Daily Stock Report'; document.getElementById('report-modal').style.display = 'flex'; }
window.downloadReport = function() { let fromD = document.getElementById('rep-from').value; let toD = document.getElementById('rep-to').value; let type = document.getElementById('report-modal-type').value; if(!fromD || !toD) return alert("Please select both dates!"); document.getElementById('report-modal').style.display = 'none'; if(type === 'ledger') generateAccountStatement(fromD, toD); else generateStockReport(fromD, toD); }

function generateAccountStatement(fromD, toD) {
    let fromTime = new Date(fromD).getTime(); let toTime = new Date(toD + "T23:59:59").getTime();
    let custEntries = allLedgerData.filter(e => e.name === currentPartyName).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let openingBal = 0; let statementHtml = ""; let currentBal = 0;
    custEntries.forEach(entry => { let eTime = new Date(entry.date).getTime(); let amt = parseFloat(entry.amount) || 0; if(eTime < fromTime) { if(entry.type === 'Gave') openingBal += amt; else openingBal -= amt; } });
    currentBal = openingBal;
    let opBalStr = openingBal > 0 ? `₹${openingBal} Dr` : (openingBal < 0 ? `₹${Math.abs(openingBal)} Cr` : `₹0`);
    
    statementHtml += `<tr><td colspan="4" style="padding:10px; border:1px solid #e0e2e0; text-align:right; font-weight:bold; color:var(--primary);">Opening Balance:</td><td style="padding:10px; border:1px solid #e0e2e0; text-align:right; font-weight:bold; color:var(--primary);">${opBalStr}</td></tr>`;
    
    custEntries.forEach(entry => { 
        let eTime = new Date(entry.date).getTime(); 
        if(eTime >= fromTime && eTime <= toTime) { 
            let amt = parseFloat(entry.amount) || 0; 
            let gave = entry.type === 'Gave' ? amt : 0; 
            let got = entry.type === 'Got' ? amt : 0; 
            currentBal += (gave - got); 
            
            let d = new Date(entry.date);
            let dStr = isNaN(d) ? entry.date : d.toLocaleString('en-GB', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}); 
            
            let curBalStr = currentBal > 0 ? `₹${currentBal} Dr` : (currentBal < 0 ? `₹${Math.abs(currentBal)} Cr` : `₹0`); 
            statementHtml += `<tr><td style="padding:10px; border:1px solid #e0e2e0; font-size:12px;">${dStr}</td><td style="padding:10px; border:1px solid #e0e2e0; font-size:13px;">${entry.details || 'App Entry'}</td><td style="padding:10px; border:1px solid #e0e2e0; text-align:right; color:var(--danger);">${gave ? '₹'+gave : '-'}</td><td style="padding:10px; border:1px solid #e0e2e0; text-align:right; color:var(--success);">${got ? '₹'+got : '-'}</td><td style="padding:10px; border:1px solid #e0e2e0; text-align:right; font-weight:bold;">${curBalStr}</td></tr>`; 
        } 
    });
    
    document.getElementById('ps-date-range').innerText = `From: ${new Date(fromD).toLocaleDateString('en-GB')} To: ${new Date(toD).toLocaleDateString('en-GB')}`; 
    document.getElementById('ps-party-name').innerText = currentPartyName; 
    document.getElementById('ps-table-body').innerHTML = statementHtml; 
    
    let finalBalStr = currentBal > 0 ? `₹${currentBal} Dr` : (currentBal < 0 ? `₹${Math.abs(currentBal)} Cr` : `₹0`); 
    document.getElementById('ps-closing-bal').innerText = finalBalStr;
    
    let previewHtml = document.getElementById('pdf-statement-template').innerHTML; 
    document.getElementById('preview-render-area').innerHTML = previewHtml; 
    window.currentReportElemId = 'pdf-statement-template'; 
    window.currentReportFilename = `Statement_${currentPartyName}_${fromD}.pdf`; 
    openPage('report-preview-page');
}

function generateStockReport(fromD, toD) {
    let fromTime = new Date(fromD).getTime(); let toTime = new Date(toD + "T23:59:59").getTime(); let stockHtml = "";
    let filteredTransfers = allGodownTransfers.filter(t => { let eTime = new Date(t.date).getTime(); return eTime >= fromTime && eTime <= toTime; });
    filteredTransfers.forEach(t => { let dStr = new Date(t.date).toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}); let action = t.type === 'IN' ? 'Transfer IN' : 'Transfer OUT'; stockHtml += `<tr><td style="padding:10px; border:1px solid #e0e2e0;">${dStr}</td><td style="padding:10px; border:1px solid #e0e2e0;">${action}</td><td style="padding:10px; border:1px solid #e0e2e0;">${t.item} (${t.cat})</td><td style="padding:10px; border:1px solid #e0e2e0;">Godown</td><td style="padding:10px; border:1px solid #e0e2e0; text-align:right;">${t.qty}</td></tr>`; });
    let salesEntries = allLedgerData.filter(e => { let eTime = new Date(e.date).getTime(); return eTime >= fromTime && eTime <= toTime && e.cart && e.type === 'Gave'; });
    salesEntries.forEach(entry => { let dStr = new Date(entry.date).toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}); entry.cart.forEach(item => { stockHtml += `<tr><td style="padding:10px; border:1px solid #e0e2e0;">${dStr}</td><td style="padding:10px; border:1px solid #e0e2e0;">Sale (OUT)</td><td style="padding:10px; border:1px solid #e0e2e0;">${item.shade} (${item.cat})</td><td style="padding:10px; border:1px solid #e0e2e0;">${entry.name}</td><td style="padding:10px; border:1px solid #e0e2e0; text-align:right;">${item.qty}</td></tr>`; }); });
    if(!stockHtml) stockHtml = `<tr><td colspan="5" style="text-align:center; padding:20px;">No stock movement found for these dates.</td></tr>`;
    document.getElementById('psr-date-range').innerText = `From: ${new Date(fromD).toLocaleDateString('en-GB')} To: ${new Date(toD).toLocaleDateString('en-GB')}`; document.getElementById('psr-table-body').innerHTML = stockHtml;
    let previewHtml = document.getElementById('pdf-stock-template').innerHTML; document.getElementById('preview-render-area').innerHTML = previewHtml; window.currentReportElemId = 'pdf-stock-template'; window.currentReportFilename = `Stock_Report_${fromD}.pdf`; openPage('report-preview-page');
}

window.executeReportDownload = function() { let elem = document.getElementById(window.currentReportElemId); let opt = { margin: 0.4, filename: window.currentReportFilename, image: { type: 'jpeg', quality: 1 }, html2canvas: { scale: 2, windowWidth: 700 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } }; alert("Downloading PDF... Please wait."); html2pdf().set(opt).from(elem).save(); }

window.shareReportPDF = async function() { 
    let elem = document.getElementById(window.currentReportElemId); 
    let opt = { margin: [0.4, 0.4, 0.4, 0.4], filename: window.currentReportFilename, image: { type: 'jpeg', quality: 1 }, html2canvas: { scale: 2, useCORS: true, windowWidth: 700 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } }; 
    try { 
        alert("Preparing PDF for direct sharing... this may take a few seconds."); 
        let pdfBlob = await html2pdf().set(opt).from(elem).output('blob'); 
        let file = new File([pdfBlob], opt.filename, { type: 'application/pdf' }); 
        if (navigator.canShare && navigator.canShare({ files: [file] })) { 
            await navigator.share({ files: [file], title: 'Vandana Enterprises Report', text: `Please find attached the report.` }); 
        } else { 
            alert("Your browser does not support direct PDF sharing. Downloading instead..."); 
            html2pdf().set(opt).from(elem).save(); 
        } 
    } catch(e) { console.error(e); } 
}

window.openAbsentCustomers = function() { let today = document.getElementById('dash-date-picker').value; let activeToday = new Set(); allLedgerData.forEach(entry => { try { let d = new Date(entry.date).toISOString().split('T')[0]; if(d === today) activeToday.add(entry.name); }catch(e){} }); let absentList = globalCustomers.filter(c => !activeToday.has(c.name) && (c.type === 'Customer' || !c.type)); let html = ""; if(absentList.length === 0) { html = "<div style='padding:40px 20px; text-align:center; color:var(--text-muted); font-size:14px;'>Wow! Every customer has an entry today. 🎉</div>"; } else { absentList.forEach(c => { let initial = c.name ? c.name.substring(0,2).toUpperCase() : "CU"; let adminPic = localStorage.getItem('v_adminPic'); let custPic = c.pic || adminPic; let avatarHtml = custPic ? `<img src="${custPic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : initial; let msg = encodeURIComponent(`नमस्ते ${c.name} जी, वंदना एंटरप्राइजेज से। आज आप शॉप पर नहीं आए, अगर कोई आर्डर या रिक्वायरमेंट हो तो जरूर बताएं।`); html += `<div class="kb-list-item"><div class="kb-list-left"><div class="kb-avatar">${avatarHtml}</div><div><div class="kb-name">${c.name}</div><div class="kb-time">📱 ${c.phone || 'N/A'}</div></div></div><div class="kb-list-right" style="padding:0 16px; flex-direction:row; align-items:center; gap:10px; border-left:none; background:transparent;"><a href="tel:${c.phone}" style="text-decoration:none; background:#e8f0fe; color:var(--primary); padding:8px; border-radius:50%; display:flex; justify-content:center; align-items:center;"><span class="material-symbols-rounded" style="font-size:18px;">call</span></a><a href="#" onclick="window.open('https://wa.me/91${c.phone}?text=${msg}', '_blank')" style="text-decoration:none; background:#e6f4ea; color:var(--success); padding:8px; border-radius:50%; display:flex; justify-content:center; align-items:center;"><span class="material-symbols-rounded" style="font-size:18px;">chat</span></a></div></div>`; }); } document.getElementById('absent-list-container').innerHTML = html; openPage('absent-page'); }

function loadAdminProfile() { 
    let pName = localStorage.getItem('v_adminName') || "Admin"; 
    let pPhone = localStorage.getItem('v_adminPhone') || ""; 
    let pEmail = localStorage.getItem('v_adminEmail') || "admin@vandana.com"; 
    let pGst = localStorage.getItem('v_adminGst') || ""; 
    let pAddr = localStorage.getItem('v_adminAddr') || ""; 
    let pUpi = localStorage.getItem('v_adminUpi') || ""; 
    let pPic = localStorage.getItem('v_adminPic'); 

    if(document.getElementById('ap-name')) document.getElementById('ap-name').value = pName; 
    if(document.getElementById('ap-phone')) document.getElementById('ap-phone').value = pPhone; 
    if(document.getElementById('ap-email')) document.getElementById('ap-email').value = pEmail; 
    if(document.getElementById('ap-gst')) document.getElementById('ap-gst').value = pGst; 
    if(document.getElementById('ap-address')) document.getElementById('ap-address').value = pAddr; 
    if(document.getElementById('ap-upi')) document.getElementById('ap-upi').value = pUpi; 

    if(document.getElementById('pm-email-display')) document.getElementById('pm-email-display').innerText = pName; 
    if(document.getElementById('user-name')) document.getElementById('user-name').innerText = pName; 
    
    if(document.getElementById('dynamic-greeting')) {
        const hour = new Date().getHours(); 
        let greetText = "Good morning";
        if (hour >= 12 && hour < 17) greetText = "Good afternoon"; 
        else if (hour >= 17) greetText = "Good evening";
        document.getElementById('dynamic-greeting').innerText = greetText + ", " + pName;
    }
    
    if(pPic) { 
        if(document.getElementById('admin-big-avatar')) document.getElementById('admin-big-avatar').innerHTML = `<img src="${pPic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        if(document.getElementById('pm-avatar-img')) { document.getElementById('pm-avatar-img').src = pPic; document.getElementById('pm-avatar-img').style.display = 'block'; document.getElementById('pm-avatar-text').style.display = 'none'; } 
        if(document.getElementById('top-avatar-img')) { document.getElementById('top-avatar-img').src = pPic; document.getElementById('top-avatar-img').style.display = 'block'; document.getElementById('top-avatar-text').style.display = 'none'; } 
    } else { 
        let initial = pName.charAt(0).toUpperCase(); 
        if(document.getElementById('pm-avatar-img')) { document.getElementById('pm-avatar-img').style.display = 'none'; document.getElementById('pm-avatar-text').innerText = initial; document.getElementById('pm-avatar-text').style.display = 'block'; } 
        if(document.getElementById('top-avatar-img')) { document.getElementById('top-avatar-img').style.display = 'none'; document.getElementById('top-avatar-text').innerText = initial; document.getElementById('top-avatar-text').style.display = 'flex'; } 
    } 
    updateGreeting(); 
}

window.saveAdminProfile = function() { 
    let pName = document.getElementById('ap-name').value.trim() || "Vandana Enterprises";
    let pPhone = document.getElementById('ap-phone').value.trim();
    let pEmail = document.getElementById('ap-email').value.trim();
    let pGst = document.getElementById('ap-gst').value.toUpperCase();
    let pAddr = document.getElementById('ap-address').value.trim();
    let pUpi = document.getElementById('ap-upi').value.trim();

    localStorage.setItem('v_adminName', pName); 
    localStorage.setItem('v_adminPhone', pPhone); 
    localStorage.setItem('v_adminEmail', pEmail); 
    localStorage.setItem('v_adminGst', pGst); 
    localStorage.setItem('v_adminAddr', pAddr); 
    localStorage.setItem('v_adminUpi', pUpi);
    
    update(ref(db, 'BusinessProfile'), {
        name: pName, phone: pPhone, email: pEmail, gst: pGst, address: pAddr, upi: pUpi
    }).then(() => {
        loadAdminProfile(); 
        if(typeof window.applyDataFiltering === 'function') window.applyDataFiltering();
        if (typeof window.showSaaSToast === 'function') window.showSaaSToast("Business Profile Permanently Saved!");
        else alert("Profile Saved Successfully!"); 
    }).catch(err => alert("Error saving profile: " + err.message));
}

window.handleAdminPic = function(event) { let file = event.target.files[0]; if(file) { let reader = new FileReader(); reader.onload = function(e) { document.getElementById('crop-modal').style.display = 'flex'; let img = document.getElementById('crop-image'); img.src = e.target.result; if(cropper) cropper.destroy(); setTimeout(() => { cropper = new Cropper(img, { aspectRatio: 1, viewMode: 1, background: false }); }, 200); }; reader.readAsDataURL(file); } }
window.cancelCrop = function() { document.getElementById('crop-modal').style.display = 'none'; }

window.applyCrop = function() { 
    if(!cropper) return; 
    let canvas = cropper.getCroppedCanvas({ width: 300, height: 300 }); 
    let dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    document.getElementById('crop-modal').style.display = 'none'; 
    if (typeof window.showSaaSToast === 'function') window.showSaaSToast("फोटो क्लाउड पर सेव हो रही है... कृपया रुकें!");
    else alert("फोटो क्लाउड पर सेव हो रही है... कृपया रुकें!");

    const imageRef = storageRef(storage, 'ProfileImages/admin_pic_' + Date.now() + '.jpg');
    uploadString(imageRef, dataUrl, 'data_url').then((snapshot) => {
        getDownloadURL(snapshot.ref).then((downloadURL) => {
            localStorage.setItem('v_adminPic', downloadURL); 
            
            update(ref(db, 'BusinessProfile'), { pic: downloadURL }).then(() => {
                loadAdminProfile(); 
                if(typeof window.applyDataFiltering === 'function') window.applyDataFiltering();
                if (typeof window.showSaaSToast === 'function') window.showSaaSToast("Profile Photo Updated!");
            });
        });
    }).catch((error) => {
        alert("Photo upload failed: " + error.message);
    });
}

window.handleCustPic = function(event) { let file = event.target.files[0]; if(file) { let reader = new FileReader(); reader.onload = function(e) { document.getElementById('cust-crop-modal').style.display = 'flex'; let img = document.getElementById('cust-crop-image'); img.src = e.target.result; if(custCropper) custCropper.destroy(); setTimeout(() => { custCropper = new Cropper(img, { aspectRatio: 1, viewMode: 1, background: false }); }, 200); }; reader.readAsDataURL(file); } }
window.cancelCustCrop = function() { document.getElementById('cust-crop-modal').style.display = 'none'; }
window.applyCustCrop = function() { 
    if(!custCropper) return; 
    let dataUrl = custCropper.getCroppedCanvas({ width: 300, height: 300 }).toDataURL('image/jpeg', 0.8); 
    
    document.getElementById('cust-crop-modal').style.display = 'none'; 
    if (typeof window.showSaaSToast === 'function') window.showSaaSToast("फोटो क्लाउड पर सेव हो रही है... कृपया रुकें!");
    else alert("फोटो क्लाउड पर सेव हो रही है... कृपया रुकें!");

    const imageRef = storageRef(storage, 'ProfileImages/cust_' + Date.now() + '.jpg');
    uploadString(imageRef, dataUrl, 'data_url').then((snapshot) => {
        getDownloadURL(snapshot.ref).then((downloadURL) => {
            if (currentPartyKey) {
                update(ref(db, 'Customers/' + currentPartyKey), { pic: downloadURL });
            }
            if (auth.currentUser) {
                update(ref(db, 'AppUsers/' + auth.currentUser.uid), { photo: downloadURL });
            }

            document.getElementById('cp-avatar').innerHTML = `<img src="${downloadURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`; 
            document.getElementById('cp-mini-avatar').innerHTML = `<img src="${downloadURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`; 
            
            if (document.getElementById('pm-avatar-img')) {
                document.getElementById('pm-avatar-img').src = downloadURL;
                document.getElementById('pm-avatar-img').style.display = 'block';
                document.getElementById('pm-avatar-text').style.display = 'none';
            }
            if (document.getElementById('top-avatar-img')) {
                document.getElementById('top-avatar-img').src = downloadURL;
                document.getElementById('top-avatar-img').style.display = 'block';
                document.getElementById('top-avatar-text').style.display = 'none';
            }

            if (typeof window.showSaaSToast === 'function') window.showSaaSToast("Profile photo updated successfully!");
        });
    }).catch((error) => {
        alert("Photo upload failed: " + error.message);
    });
}
window.processGodown = function(type) { 
    let editKey = document.getElementById('gd-edit-key').value;
    let cat = document.getElementById('gd-cat').value; 
    let item = document.getElementById('gd-item').value; 
    let qty = parseInt(document.getElementById('gd-qty').value); 
    let rate = parseFloat(document.getElementById('gd-rate').value) || 0;
    
    if(!item || isNaN(qty) || qty <= 0 || rate <= 0) return alert("Please enter valid Item Name, Quantity, and Rate!"); 
    
    let dateVal = document.getElementById('gd-date').value;
    let finalDateTime;
    if(dateVal) {
        let [year, month, day] = dateVal.split('-');
        let dObj = new Date(); 
        dObj.setFullYear(year, parseInt(month) - 1, day);
        finalDateTime = dObj.toISOString();
    } else {
        finalDateTime = new Date().toISOString();
    }

    let totalAmount = qty * rate;
    let invKey = cat + "_" + item; 
    let itemRef = ref(db, 'Inventory/' + invKey); 
    
    get(itemRef).then((snap) => { 
        let cur = snap.val() || { cone: 0, kg: 0 }; 
        if(typeof cur === 'number') cur = { cone: cur, kg: 0 };
        let newConeQty = type === 'OUT' ? cur.cone - qty : cur.cone + qty; 
        if(newConeQty < 0) newConeQty = 0; 
        set(itemRef, { cone: newConeQty, kg: cur.kg }); 
    }); 
    
    let dataObj = { 
        date: finalDateTime, cat: cat, item: item, qty: qty, rate: rate, amount: totalAmount, type: type 
    };

    if(editKey) {
        update(ref(db, 'GodownTransfers/' + editKey), dataObj);
        alert("Entry Updated!");
        document.getElementById('gd-edit-key').value = '';
        document.getElementById('gd-btn-in').style.display = 'block';
        document.getElementById('gd-btn-out').style.display = 'block';
    } else {
        push(ref(db, 'GodownTransfers'), dataObj); 
        alert(type === 'IN' ? `Stock Received from Shop!` : `Stock Sent to Shop!`); 
    }
    
    document.getElementById('gd-item').value = ''; 
    document.getElementById('gd-qty').value = ''; 
    document.getElementById('gd-rate').value = ''; 
    document.getElementById('gd-form-panel').classList.add('form-hidden'); 
}
window.currentGdFilterMode = 'month';

window.updateMonthLabel = function() {
    let val = document.getElementById('godown-date-picker').value; 
    if(val) {
        let [yyyy, mm] = val.split('-');
        let monthName = new Date(yyyy, parseInt(mm)-1, 1).toLocaleString('default', { month: 'short' });
        document.getElementById('gd-month-label').innerText = `${monthName} ${yyyy}`;
    }
}

window.toggleGdFilter = function(mode) {
    let btnMonth = document.getElementById('btn-gd-month');
    let btnCustom = document.getElementById('btn-gd-custom');
    let customBox = document.getElementById('gd-custom-filter-box');

    if(mode === 'custom') {
        if (customBox.style.display === 'block') {
            window.currentGdFilterMode = 'month';
            customBox.style.display = 'none';
            btnCustom.style.borderColor = 'var(--border)'; btnCustom.style.color = 'var(--text-muted)';
            btnMonth.style.borderColor = 'var(--primary)'; btnMonth.style.color = 'var(--primary)';
        } else {
            window.currentGdFilterMode = 'custom';
            customBox.style.display = 'block';
            btnCustom.style.borderColor = 'var(--primary)'; btnCustom.style.color = 'var(--primary)';
            btnMonth.style.borderColor = 'var(--border)'; btnMonth.style.color = 'var(--text-muted)';
            
            if(!document.getElementById('gd-from').value) {
                let d = new Date(); d.setDate(1);
                document.getElementById('gd-from').value = d.toISOString().split('T')[0];
                document.getElementById('gd-to').value = new Date().toISOString().split('T')[0];
            }
        }
    } else {
        window.currentGdFilterMode = 'month';
        customBox.style.display = 'none';
        btnMonth.style.borderColor = 'var(--primary)'; btnMonth.style.color = 'var(--primary)';
        btnCustom.style.borderColor = 'var(--border)'; btnCustom.style.color = 'var(--text-muted)';
    }
    renderGodownHistory();
}

window.openGdCustomReport = function() {
    let fromD = document.getElementById('gd-from').value;
    let toD = document.getElementById('gd-to').value;
    if(!fromD || !toD) return alert('Please select From Date and To Date!');
    generateStockReport(fromD, toD);
}

window.renderGodownHistory = function() { 
    let mode = window.currentGdFilterMode || 'month';
    let searchQuery = document.getElementById('gd-search-history').value.toLowerCase().trim();
    
    let monthIn = 0; let monthOut = 0;
    let filteredTransfers = [];

    if (mode === 'month') {
        let filterMonth = document.getElementById('godown-date-picker').value; 
        if(!filterMonth) {
            let today = new Date();
            filterMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
            document.getElementById('godown-date-picker').value = filterMonth;
            updateMonthLabel();
        }
        filteredTransfers = allGodownTransfers.filter(t => { 
            let tMonth = ""; 
            try { tMonth = new Date(t.date).toISOString().slice(0, 7); } catch(e){} 
            
            if(tMonth === filterMonth) {
                let amt = parseFloat(t.amount) || 0;
                if(t.type === 'IN') monthIn += amt;
                if(t.type === 'OUT') monthOut += amt;
                
                if(searchQuery) {
                    return (t.item && t.item.toLowerCase().includes(searchQuery)) || (t.cat && t.cat.toLowerCase().includes(searchQuery));
                }
                return true;
            }
            return false; 
        }); 
    } else {
        let fromD = document.getElementById('gd-from').value;
        let toD = document.getElementById('gd-to').value;
        if(fromD && toD) {
            let fromTime = new Date(fromD).getTime(); 
            let toTime = new Date(toD + "T23:59:59").getTime();
            filteredTransfers = allGodownTransfers.filter(t => { 
                let tTime = new Date(t.date).getTime();
                if(tTime >= fromTime && tTime <= toTime) {
                    let amt = parseFloat(t.amount) || 0;
                    if(t.type === 'IN') monthIn += amt;
                    if(t.type === 'OUT') monthOut += amt;
                    
                    if(searchQuery) {
                        return (t.item && t.item.toLowerCase().includes(searchQuery)) || (t.cat && t.cat.toLowerCase().includes(searchQuery));
                    }
                    return true;
                }
                return false;
            });
        }
    }

    document.getElementById('gd-month-in').innerText = "₹ " + monthIn.toLocaleString('en-IN');
    document.getElementById('gd-month-out').innerText = "₹ " + monthOut.toLocaleString('en-IN');
    
    let netBal = monthIn - monthOut;
    let balEl = document.getElementById('gd-month-bal');
    balEl.innerText = "₹ " + Math.abs(netBal).toLocaleString('en-IN');
    if(netBal > 0) { balEl.style.color = "var(--danger)"; } 
    else if (netBal < 0) { balEl.style.color = "var(--success)"; } 
    else { balEl.style.color = "var(--primary)"; }

    let html = ""; 
    if(filteredTransfers.length === 0) { 
        html = '<div style="text-align:center; padding:30px; color:gray;">No entries found.</div>'; 
    } else { 
        filteredTransfers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        filteredTransfers.forEach(t => { 
            if(t.type.includes('Payment')) return; 
            let d = new Date(t.date); 
            let dateStr = isNaN(d) ? t.date : d.toLocaleDateString('en-GB', {day:'numeric', month:'short'}) + " " + d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}); 
            
            let color = t.type === 'IN' ? 'var(--success)' : 'var(--danger)'; 
            let icon = t.type === 'IN' ? '🟢 IN' : '🔴 OUT'; 
            let amountStr = t.amount ? `<span style="font-size:14px; color:var(--text-dark); font-weight:700;">₹${t.amount.toLocaleString('en-IN')}</span> <span style="font-size:10px; color:gray;">(@₹${t.rate})</span>` : "";
            let challanBtn = t.type === 'OUT' ? `<button class="btn-submit material-symbols-rounded" style="padding:4px 8px; font-size:16px; background:var(--primary);" onclick="shareGdChallan('${t.key}')">share</button>` : '';

            html += `
            <div class="entry-card" style="padding:14px; border:1px solid var(--border); margin-bottom:10px; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <div>
                        <div style="font-weight:700; color:var(--text-dark); font-size:15px;">${t.item} <span style="font-size:11px; color:gray;">(${t.cat})</span></div>
                        <div style="font-size:11px; color:var(--text-muted);">${dateStr}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="color:${color}; font-weight:800; font-size:14px;">${icon} ${t.qty} Cone</div>
                        ${amountStr}
                    </div>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:8px;">
                    ${challanBtn}
                    <button class="btn-outline material-symbols-rounded" style="padding:4px 8px; font-size:16px; color:var(--primary); border-color:var(--primary);" onclick="editGdTransfer('${t.key}')">edit</button>
                    <button class="btn-outline material-symbols-rounded" style="padding:4px 8px; font-size:16px; color:var(--danger); border-color:var(--danger);" onclick="deleteGdTransfer('${t.key}', '${t.type}', '${t.cat}', '${t.item}', ${t.qty})">delete</button>
                </div>
            </div>`; 
        }); 
    } 
    document.getElementById('godown-history-list').innerHTML = html; 
}

window.showCelebration = function(name) { document.getElementById('celeb-name').innerText = name; document.getElementById('celebration-modal').style.display = 'flex'; var duration = 4000; var animationEnd = Date.now() + duration; var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 }; function randomInRange(min, max) { return Math.random() * (max - min) + min; } var interval = setInterval(function() { var timeLeft = animationEnd - Date.now(); if (timeLeft <= 0) return clearInterval(interval); var particleCount = 50 * (timeLeft / duration); confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.9), y: Math.random() - 0.2 } })); }, 250); }

function setupPOSAutocomplete() { let dlHtml = ""; globalCustomers.forEach(c => dlHtml += `<option value="${c.name}">`); document.getElementById('pos-customers-dl').innerHTML = dlHtml; }

window.openCustomerProfile = function() { 
    let customer = globalCustomers.find(c => c.name === currentPartyName); 
    if(!customer) return; 
    currentPartyKey = customer.key; 
    sessionStorage.setItem('v_currentPartyName', currentPartyName); 
    let adminPic = localStorage.getItem('v_adminPic'); 
    let custPic = customer.pic || adminPic; 
    
    if(custPic) { 
        document.getElementById('cp-avatar').innerHTML = `<img src="${custPic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`; 
        document.getElementById('cp-mini-avatar').innerHTML = `<img src="${custPic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`; 
    } else { 
        document.getElementById('cp-avatar').innerHTML = customer.name.substring(0, 1).toUpperCase(); 
        document.getElementById('cp-mini-avatar').innerHTML = customer.name.substring(0, 1).toUpperCase(); 
    } 
    
    document.getElementById('cp-edit-name').value = customer.name; 
    document.getElementById('cp-edit-phone').value = customer.phone || ""; 
    document.getElementById('cp-edit-email').value = customer.email || ""; 
    document.getElementById('cp-edit-address').value = customer.address || ""; 

    let isAdmin = (window.currentUserRole === 'admin');
    document.getElementById('cp-edit-name').disabled = !isAdmin;
    document.getElementById('cp-edit-phone').disabled = !isAdmin;
    document.getElementById('cp-edit-email').disabled = !isAdmin;

    let lockColor = isAdmin ? 'var(--text-dark)' : '#7f8c8d';
    let lockBg = isAdmin ? 'white' : '#f0f4f9';
    ['cp-edit-name', 'cp-edit-phone', 'cp-edit-email'].forEach(id => {
        document.getElementById(id).style.color = lockColor;
        document.getElementById(id).style.backgroundColor = lockBg;
    });

    document.getElementById('cp-header-name').innerText = customer.name; 
    document.getElementById('cp-scroll-content').scrollTop = 0; 
    document.getElementById('cp-header-group').style.opacity = '0'; 
    document.getElementById('cp-header-group').style.transform = 'translateY(10px)'; 
    document.getElementById('cp-main-title').style.opacity = '1'; 
    
    let bWrap = document.getElementById('cp-big-avatar-wrap'); 
    if(bWrap) { 
        bWrap.style.opacity = '1'; 
        bWrap.style.transform = 'scale(1)'; 
        bWrap.style.pointerEvents = 'auto'; 
    } 
    openPage('customer-profile-page'); 
}

window.saveCustomerProfile = function() { 
    let nName = document.getElementById('cp-edit-name').value.trim(); 
    let nPhone = document.getElementById('cp-edit-phone').value; 
    let nEmail = document.getElementById('cp-edit-email').value.trim(); 
    let nAddr = document.getElementById('cp-edit-address').value; 
    
    if(!nName) return window.showSaaSToast("Name is required!"); 
    
    let oldName = currentPartyName;
    let isAdmin = (window.currentUserRole === 'admin');

    if (isAdmin) {
        update(ref(db, 'Customers/' + currentPartyKey), { name: nName, phone: nPhone, email: nEmail, address: nAddr }); 
        
        if (oldName !== nName) {
            allLedgerData.forEach(entry => {
                if (entry.name === oldName) {
                    update(ref(db, 'Ledger/' + entry.key), { name: nName });
                }
            });
            allPendingRequests.forEach(req => {
                if (req.name === oldName) {
                    update(ref(db, 'PendingRequests/' + req.key), { name: nName });
                }
            });
        }
    } else {
        update(ref(db, 'Customers/' + currentPartyKey), { address: nAddr });
    }

    currentPartyName = nName; 
    currentPartyPhone = nPhone; 
    sessionStorage.setItem('v_currentPartyName', nName); 
    document.getElementById('l-deep-name').innerText = nName; 
    document.getElementById('cp-header-name').innerText = nName; 
    
    window.showSaaSToast("Profile Updated Successfully!"); 
    closePage('customer-profile-page'); 
}
window.addCustomerToCloud = function() { let name = document.getElementById('new-party-name').value.trim(); let phone = document.getElementById('new-party-phone').value; let address = document.getElementById('new-party-address').value; if(!name) return alert("Please enter Name!"); push(ref(db, 'Customers'), { name, phone, address, date: new Date().toISOString(), status: "Active", type: currentTabType }); closePage('add-party-page'); document.getElementById('new-party-name').value = ''; document.getElementById('new-party-phone').value = ''; document.getElementById('new-party-address').value = ''; }
window.deleteCurrentCustomer = function() { 
    if(confirm(`WARNING: क्या आप सच में ${currentPartyName} और उनके सारे बिल/एंट्री हमेशा के लिए डिलीट करना चाहते हैं?`)) { 
        remove(ref(db, 'Customers/' + currentPartyKey)); 
        allLedgerData.forEach(entry => { if(entry.name === currentPartyName) remove(ref(db, 'Ledger/' + entry.key)); });
        allPendingRequests.forEach(req => { if(req.name === currentPartyName) remove(ref(db, 'PendingRequests/' + req.key)); });
        allRecycleData.forEach(delItem => { if(delItem.name === currentPartyName) remove(ref(db, 'RecycleBin/' + delItem.key)); });
        closePage('customer-profile-page'); 
        closePage('ledger-deep-page'); 
        alert("कस्टमर और उनका सारा डेटा हमेशा के लिए डिलीट हो गया!"); 
    } 
}

window.switchPartyTab = function(type) { currentTabType = type; document.getElementById('tab-customers').classList.toggle('active', type === 'Customer'); document.getElementById('tab-suppliers').classList.toggle('active', type === 'Supplier'); let btnText = type === 'Customer' ? 'Add Customer' : 'Add Supplier'; document.getElementById('fab-text').innerText = btnText; updateLedgerTotalsUI(); renderCustomerList(globalCustomers); }
window.updateLedgerTotalsUI = function() { if(currentTabType === 'Customer') { document.getElementById('lbl-give').innerText = "Total You Give"; document.getElementById('total-give-all').innerText = "₹ " + window.ledgerTotals.custGive.toLocaleString(); document.getElementById('lbl-get').innerText = "Total You Get"; document.getElementById('total-get-all').innerText = "₹ " + window.ledgerTotals.custGet.toLocaleString(); } else { document.getElementById('lbl-give').innerText = "Total You Give"; document.getElementById('total-give-all').innerText = "₹ " + window.ledgerTotals.supGive.toLocaleString(); document.getElementById('lbl-get').innerText = "Total You Get"; document.getElementById('total-get-all').innerText = "₹ " + window.ledgerTotals.supGet.toLocaleString(); } }
window.switchTopCustTab = function(type) { window.currentTopCustTab = type; document.getElementById('tc-curr-tab').classList.toggle('active', type === 'current'); document.getElementById('tc-last-tab').classList.toggle('active', type === 'last'); calculateGrandTotals(); }

window.calculateGrandTotals = function() {
    let balances = {}; let todayTotalSale = 0; let todayTotalBox = 0; let currMonthSales = {}; let lastMonthSales = {}; let selectedDateString = document.getElementById('dash-date-picker').value; let todayDate = new Date(); let currentMonth = todayDate.toISOString().slice(0, 7); let lmDate = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1); let lastMonth = lmDate.toISOString().slice(0, 7);
    allLedgerData.forEach(entry => { let amt = parseFloat(entry.amount) || 0; let entryDateString = ""; let entryMonthString = ""; try { let d = new Date(entry.date); if (!isNaN(d)) { entryDateString = d.toISOString().split('T')[0]; entryMonthString = d.toISOString().slice(0, 7); } } catch(e){} if(!balances[entry.name]) balances[entry.name] = 0; if(entry.type === 'Gave') balances[entry.name] += amt; if(entry.type === 'Got') balances[entry.name] -= amt; if (entry.details && entry.details.includes("Invoice")) { if(entryMonthString === currentMonth) { currMonthSales[entry.name] = (currMonthSales[entry.name] || 0) + amt; } if(entryMonthString === lastMonth) { lastMonthSales[entry.name] = (lastMonthSales[entry.name] || 0) + amt; } if(entryDateString === selectedDateString){ todayTotalSale += amt; let boxMatch = entry.details.match(/(\d+)\s*Box/i); if (boxMatch && boxMatch[1]) todayTotalBox += parseInt(boxMatch[1]); } } });
    window.globalBalances = balances; 
    let partyTypes = {}; 
    globalCustomers.forEach(c => { if(c.name) partyTypes[c.name.toLowerCase()] = c.type || 'Customer'; }); 
    let cGive = 0, cGet = 0, sGive = 0, sGet = 0; 
    for(let cust in balances) { 
        let pType = partyTypes[cust.toLowerCase()] || 'Customer'; 
        let bal = balances[cust]; 
        if(pType === 'Customer') { 
            if(bal > 0) cGet += bal; 
            if(bal < 0) cGive += Math.abs(bal); 
        } else { 
            if(bal > 0) sGet += bal; 
            if(bal < 0) sGive += Math.abs(bal); 
        } 
    }
    window.ledgerTotals = { custGive: cGive, custGet: cGet, supGive: sGive, supGet: sGet }; updateLedgerTotalsUI(); if(document.getElementById('parties-page').classList.contains('active')) { renderCustomerList(globalCustomers); }
    if(document.getElementById('dash-card-sale-value')) document.getElementById('dash-card-sale-value').innerText = `₹${todayTotalSale.toLocaleString('en-IN')}`;

    let selectedDateObj = new Date(selectedDateString);
    let todayObj = new Date();
    let isToday = (selectedDateObj.toDateString() === todayObj.toDateString());
    let dateDisplay = isToday ? "Today" : selectedDateObj.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});

    let role = window.currentUserRole;
    let prefix = (role === 'admin') ? "Sales" : ((role === 'supplier') ? "Supplies" : "Purchases");
    let finalTitle = isToday ? `Today's ${prefix}` : `${prefix} - ${dateDisplay}`;

    let dashLabel = document.getElementById('dash-sales-label');
    if(dashLabel) dashLabel.innerText = finalTitle;

    let invoicePageTitle = document.getElementById('invoices-page-title');
    if(invoicePageTitle) invoicePageTitle.innerText = finalTitle;

    let TARGET_AMOUNT = 50000;
    let activeSalesData = window.currentTopCustTab === 'current' ? currMonthSales : lastMonthSales; 
    let topCustHtml = ""; 
    let allSortedCustomers = Object.entries(activeSalesData).sort((a, b) => b[1] - a[1]); 

    if (window.currentUserRole === 'admin') {
        let top5 = allSortedCustomers.slice(0, 5);
        if(top5.length === 0) { 
            topCustHtml = '<div style="text-align:center; padding:10px; color:gray; font-size:12px;">No sales data available.</div>'; 
        } else { 
            top5.forEach(cust => { topCustHtml += `<div class="ua-item" onclick="showCelebration('${cust[0]}')"><div class="ua-item-name scroll-text">${cust[0]}</div><div class="ua-item-count scroll-text">₹${cust[1].toLocaleString('en-IN')} <span style="color:var(--text-muted); font-size:16px; vertical-align:middle;" class="material-symbols-rounded">chevron_right</span></div></div>`; }); 
        }
    } else {
        let myName = globalCustomers.length > 0 ? globalCustomers[0].name : window.currentUserName;
        let myIndex = allSortedCustomers.findIndex(c => c[0] === myName);
        let myTotal = activeSalesData[myName] || 0;
        let myRank = myIndex !== -1 ? (myIndex + 1) : "-";
        let percent = Math.min((myTotal / TARGET_AMOUNT) * 100, 100).toFixed(0);

        topCustHtml = `
        <div style="background:#f8fafd; padding:16px; border-radius:12px; border:1px solid #c2e7ff; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:12px; font-weight:600; color:var(--text-dark);">
                <span>Position: #${myRank}</span>
                <span style="color:var(--primary);">₹${myTotal.toLocaleString('en-IN')} / ₹${TARGET_AMOUNT.toLocaleString('en-IN')}</span>
            </div>
            <div style="background:rgba(225, 227, 225, 0.5); height:10px; border-radius:5px; overflow:hidden;">
                <div style="background:${percent >= 100 ? 'var(--success)' : 'var(--primary)'}; height:100%; border-radius:5px; width:${percent}%; transition:width 1s ease-in-out;"></div>
            </div>
            <div style="text-align:center; font-size:12px; margin-top:12px; color:var(--text-muted); font-weight:500;">
                ${percent >= 100 ? '🎉 You unlocked 2% Additional Off!' : `Shop for ₹${(TARGET_AMOUNT - myTotal).toLocaleString('en-IN')} more to unlock 2% OFF`}
            </div>
        </div>`;

        if (myTotal >= TARGET_AMOUNT && !sessionStorage.getItem('target_celebrated')) {
            setTimeout(() => { showTargetCelebration(); }, 1000);
            sessionStorage.setItem('target_celebrated', 'true');
        }
    }
    document.getElementById('top-customers-list').innerHTML = topCustHtml;
}

window.openLedgerDetail = function(name, phone) { 
    currentPartyName = name; 
    currentPartyPhone = phone || ""; 
    sessionStorage.setItem('v_currentPartyName', name); 
    sessionStorage.setItem('v_currentPartyPhone', phone || ""); 
    
    document.getElementById('l-deep-name').innerText = name; 
    
    let isAdmin = (window.currentUserRole === 'admin');
    let adminPhone = localStorage.getItem('v_adminPhone') || "";
    let callPhone = isAdmin ? phone : adminPhone;
    
    document.getElementById('l-call-btn').href = callPhone ? `tel:${callPhone}` : "#"; 
    
    let waBtn = document.getElementById('l-wa-btn');
    
    if (isAdmin) {
        waBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px;">chat</span> Reminder`;
        waBtn.style.color = '#146c2e';
        waBtn.style.backgroundColor = 'white';
        waBtn.style.borderColor = '#e0e2e0';
        waBtn.onclick = () => window.open(`https://wa.me/91${phone}?text=Hello ${name}, reminder from Vandana Enterprises.`, '_blank'); 
    } else {
        waBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px;">payments</span> Pay Now`;
        waBtn.style.color = 'white';
        waBtn.style.backgroundColor = '#5f259f'; 
        waBtn.style.borderColor = '#5f259f';
        
        waBtn.onclick = () => {
            let upiId = localStorage.getItem('v_adminUpi');
            if (!upiId) return window.showSaaSToast("Dukandar ne abhi tak UPI ID set nahi ki hai.");
            
            let netBal = window.globalBalances[name] || 0;
            document.getElementById('payment-due-badge').innerHTML = `<span class="material-symbols-rounded" style="font-size:18px; color:var(--primary);">account_balance_wallet</span> Total Due: ₹${netBal.toLocaleString('en-IN')}`;
            document.getElementById('full-screen-pay-amount').value = netBal > 0 ? parseFloat(netBal).toFixed(0) : '';
            openPage('payment-screen-page');
        };
    }

    let customer = globalCustomers.find(c => c.name === name); 
    let initial = name ? name.substring(0,2).toUpperCase() : "CU"; 
    let adminPic = localStorage.getItem('v_adminPic'); 
    let custPic = customer && customer.pic ? customer.pic : adminPic; 
    
    if(custPic) { 
        document.getElementById('l-deep-avatar-text').innerHTML = `<img src="${custPic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`; 
    } else { 
        document.getElementById('l-deep-avatar-text').innerHTML = initial; 
    } 
    renderLedgerEntries(name); 
    openPage('ledger-deep-page'); 
}

window.saveCalculatorEntry = function() { 
    let amount = eval(window.calcValue) || 0; 
    if(amount <= 0) return alert("Enter valid amount!"); 
    let dateVal = document.getElementById('calc-date').value; 
    if(!dateVal) dateVal = new Date().toISOString().split('T')[0]; 

    let [year, month, day] = dateVal.split('-');
    let finalDateObj = new Date(); 
    finalDateObj.setFullYear(year, month - 1, day); 
    let finalIsoString = finalDateObj.toISOString();

    let isAdmin = (window.currentUserRole === 'admin');
    let entryDetails = document.getElementById('calc-details').value || "App Entry";
    
    let modeSelectElem = document.getElementById('calc-payment-mode');
    let calcModeKey = modeSelectElem ? modeSelectElem.value : "Cash"; 

    if(window.isEditingEntry && currentEntryData) { 
        let oldDateStr = new Date(currentEntryData.date).toISOString().split('T')[0];
        if (oldDateStr === dateVal) {
            finalIsoString = currentEntryData.date; 
        }

        if(isAdmin) {
            update(ref(db, 'Ledger/' + currentEntryData.key), { amount: amount, details: entryDetails, type: window.calcType, date: finalIsoString }); 
        }
        window.isEditingEntry = false; 
        currentEntryData = null; 
    } else { 
        if(isAdmin) {
            push(ref(db, 'Ledger'), { date: finalIsoString, name: currentPartyName, type: window.calcType, amount: amount, details: entryDetails }); 
            
            let modeName = "Cash";
            if(calcModeKey !== 'Cash') {
                let bank = cbBanks.find(b => b.key === calcModeKey);
                if(bank) {
                    modeName = bank.name;
                    let newBal = window.calcType === 'Got' ? (bank.balance + amount) : (bank.balance - amount);
                    update(ref(db, 'CashBankBook/Banks/' + bank.key), { balance: newBal });
                }
            }
            
            let cbType = window.calcType === 'Got' ? 'IN' : 'OUT';
            push(ref(db, 'CashBankBook/Transactions'), {
                date: finalIsoString,
                type: cbType,
                amount: amount,
                mode: modeName,
                modeKey: calcModeKey,
                details: `${currentPartyName} - ${entryDetails}`
            });

        } else {
            push(ref(db, 'PendingRequests'), { date: finalIsoString, name: currentPartyName, type: window.calcType, amount: amount, details: entryDetails, requestedBy: window.currentUserName, status: 'Pending' });
            alert("आपकी रिक्वेस्ट एडमिन को भेज दी गई है!");
        }
    } 
    closePage('calculator-page'); 
}

window.submitPaymentAndOpenUPI = function() {
    let amtElem = document.getElementById('full-screen-pay-amount');
    if(!amtElem) return;
    let amt = parseFloat(amtElem.value) || 0;
    
    if(amt <= 0) {
        if (typeof window.showSaaSToast === 'function') window.showSaaSToast("Kripya sahi amount dalein!");
        else alert("Kripya sahi amount dalein!");
        return;
    }
    
    let upiId = localStorage.getItem('v_adminUpi');
    if (!upiId) {
        if (typeof window.showSaaSToast === 'function') window.showSaaSToast("Dukandar ne abhi tak UPI ID set nahi ki hai.");
        else alert("Dukandar ne abhi tak UPI ID set nahi ki hai.");
        return;
    }

    let myName = globalCustomers.length > 0 ? globalCustomers[0].name : window.currentUserName;
    let safeAmount = amt.toFixed(2);
    let safeName = encodeURIComponent("Vandana Enterprises");

    push(ref(db, 'PendingRequests'), {
        date: new Date().toISOString(),
        name: myName, 
        type: 'Got', 
        amount: amt,
        details: "Payment sent via App",
        requestedBy: myName,
        status: 'Pending'
    }).then(() => {
        closePage('payment-screen-page');

        if (typeof window.showSaaSToast === 'function') {
            window.showSaaSToast("Payment request submitted successfully! Verifying your ledger...");
        } else {
            alert("Payment request submitted successfully! Verifying your ledger...");
        }

        window.location.href = `phonepe://pay?pa=${upiId}&pn=${safeName}&am=${safeAmount}&cu=INR`;
        
        setTimeout(() => {
            window.location.href = `upi://pay?pa=${upiId}&pn=${safeName}&am=${safeAmount}&cu=INR`;
        }, 600);
    }).catch(err => {
        if (typeof window.showSaaSToast === 'function') window.showSaaSToast("Error: " + err.message);
        else alert("Error: " + err.message);
    });
};

window.openEntryDetails = function(key) { 
    sessionStorage.setItem('v_currentEntryKey', key); 
    currentEntryData = allLedgerData.find(e => e.key === key); 
    if(!currentEntryData) return; 
    document.getElementById('ed-party-name').innerText = currentEntryData.name; 
    let d = new Date(currentEntryData.date); 
    document.getElementById('ed-date').innerText = isNaN(d) ? currentEntryData.date : d.toLocaleString('en-GB', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}); 
    
    let isAdmin = (window.currentUserRole === 'admin');
    
    let color = currentEntryData.type === 'Gave' ? 'var(--danger)' : 'var(--success)'; 
    let typeText = isAdmin ? `You ${currentEntryData.type}` : (currentEntryData.type === 'Gave' ? "Bill Amount" : "Payment Given");

    document.getElementById('ed-amount').innerText = `₹ ${parseFloat(currentEntryData.amount).toLocaleString()}`; 
    document.getElementById('ed-amount').style.color = color; 
    document.getElementById('ed-type').innerText = typeText; 
    document.getElementById('ed-type').style.color = color; 
    document.getElementById('ed-details-text').innerText = currentEntryData.details || "App Entry"; 
    
    if(currentEntryData.cart && currentEntryData.cart.length > 0) { 
        document.getElementById('ed-edit-btn-container').innerHTML = `<button class="btn-outline" onclick="editCurrentInvoice()" style="width:100%; border:1px solid var(--primary); color:var(--primary); font-family:'Product Sans', sans-serif; display:flex; align-items:center; justify-content:center; gap:6px;"><span class="material-symbols-rounded" style="font-size:18px;">edit_document</span> Edit Invoice</button>`; 
    } else { 
        document.getElementById('ed-edit-btn-container').innerHTML = `<button class="btn-outline" onclick="editCurrentEntryAmount()" style="width:100%; border:1px solid var(--primary); color:var(--primary); font-family:'Product Sans', sans-serif; display:flex; align-items:center; justify-content:center; gap:6px;"><span class="material-symbols-rounded" style="font-size:18px;">edit</span> Edit Amount & Details</button>`; 
    } 
    openPage('entry-details-page'); 
}

window.editCurrentInvoice = function() { 
    if(!confirm("Are you sure you want to edit this invoice?")) return; 
    currentEntryData.cart.forEach(item => { 
        let key = item.cat + "_" + item.shade; 
        let itemRef = ref(db, 'Inventory/' + key); 
        get(itemRef).then(snap => { set(itemRef, (snap.val() || 0) + item.qty); }); 
    }); 
    window.editingEntryKey = currentEntryData.key;
    window.editingBillNo = currentEntryData.billNo;
    window.editingEntryDate = currentEntryData.date;
    currentCart = [...currentEntryData.cart]; 
    document.getElementById('inv-party').value = currentEntryData.name; 
    let cust = globalCustomers.find(c => c.name === currentEntryData.name); 
    document.getElementById('inv-phone').value = cust ? cust.phone : ""; 
    let d = new Date(currentEntryData.date); 
    if(!isNaN(d)) document.getElementById('inv-date').value = d.toISOString().split('T')[0]; 
    window.setPaymentMode('credit'); 
    renderCartUi(); 
    navTo('pos-page', null); 
    document.getElementById('billing-form-area').style.display = 'block'; 
    document.getElementById('post-bill-area').style.display = 'none'; 
}

window.editCurrentEntryAmount = function() { if(!currentEntryData) return; window.isEditingEntry = true; window.calcType = currentEntryData.type; window.calcValue = currentEntryData.amount.toString(); document.getElementById('calc-amount').value = window.calcValue; document.getElementById('calc-details').value = currentEntryData.details || ""; document.getElementById('calc-hidden-area').classList.add('show'); document.getElementById('calc-save-btn').innerText = "UPDATE ENTRY"; let d = new Date(currentEntryData.date); if(!isNaN(d)) document.getElementById('calc-date').value = d.toISOString().split('T')[0]; closePage('entry-details-page'); openCalculator(window.calcType, true); }

window.openCalculator = function(type, skipReset = false) { 
    if(!skipReset) { 
        window.calcType = type; 
        window.calcValue = ""; 
        document.getElementById('calc-amount').value = ""; 
        document.getElementById('calc-details').value = ""; 
        document.getElementById('calc-hidden-area').classList.remove('show'); 
        document.getElementById('calc-save-btn').innerText = "SAVE ENTRY"; 
        window.isEditingEntry = false; 
    } 
    
    let modeSelect = document.getElementById('calc-payment-mode');
    if(modeSelect) {
        let modeHtml = `<option value="Cash">Cash (गल्ला)</option>`;
        if(typeof cbBanks !== 'undefined') {
            cbBanks.forEach(b => {
                modeHtml += `<option value="${b.key}">${b.name} (Bank)</option>`;
            });
        }
        modeSelect.innerHTML = modeHtml;
    }

    let color = type === 'Gave' ? 'var(--danger)' : 'var(--success)'; 
    document.getElementById('calc-header').style.color = color; 
    document.getElementById('calc-back-btn').style.color = color; 
    document.getElementById('calc-symbol').style.color = color; 
    document.getElementById('calc-amount').style.color = color; 
    document.getElementById('calc-save-btn').style.backgroundColor = color; 
    updateCalcTitle(); 
    openPage('calculator-page'); 
}
window.calcPress = function(val) { if(val === 'C') window.calcValue = ""; else if(val === 'BACK') window.calcValue = window.calcValue.slice(0, -1); else if(val === '=') { try { window.calcValue = eval(window.calcValue).toString(); } catch(e){} } else window.calcValue += val; document.getElementById('calc-amount').value = window.calcValue; if(parseFloat(window.calcValue) > 0) { document.getElementById('calc-hidden-area').classList.add('show'); } else { document.getElementById('calc-hidden-area').classList.remove('show'); } updateCalcTitle(); }
function updateCalcTitle() { document.getElementById('calc-title-text').innerText = `You ${window.calcType.toLowerCase()} ₹ ${window.calcValue || "0"} to ${currentPartyName}`; }

window.deleteCurrentEntry = function() { if(confirm("Are you sure you want to delete this entry? It will be moved to Recycle Bin.")) { set(ref(db, 'RecycleBin/' + currentEntryData.key), currentEntryData); remove(ref(db, 'Ledger/' + currentEntryData.key)); closePage('entry-details-page'); } }
window.renderRecycleBin = function() { let container = document.getElementById('recycle-list-container'); if(allRecycleData.length === 0) { container.innerHTML = `<div style="text-align:center; padding:40px; color:gray;">Recycle Bin is empty.</div>`; return; } let html = ""; allRecycleData.forEach(entry => { let d = new Date(entry.date); let dateStr = isNaN(d) ? entry.date : d.toLocaleString('en-GB'); html += `<div class="entry-card" style="flex-direction:column; padding: 16px; border: 1px solid var(--border); margin-bottom: 12px;"><div style="display:flex; justify-content:space-between; margin-bottom: 8px;"><div style="font-weight:700; font-size: 15px; color:var(--text-dark);">${entry.name}</div><div style="color:var(--text-dark); font-weight:800; font-size: 16px;">₹${parseFloat(entry.amount).toLocaleString('en-IN')}</div></div><div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">${dateStr} | ${entry.details}</div><div style="display:flex; gap:10px;"><button class="btn-submit" style="flex:1; background:#e8f0fe; color:var(--primary); padding:8px; border-radius:12px; font-size:12px; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="restoreRecycle('${entry.key}')"><span class="material-symbols-rounded" style="font-size:16px;">settings_backup_restore</span> Restore</button><button class="btn-outline" style="flex:1; border-color:var(--danger); color:var(--danger); padding:8px; border-radius:12px; font-size:12px; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="permanentlyDeleteRecycle('${entry.key}')"><span class="material-symbols-rounded" style="font-size:16px;">delete_forever</span> Delete</button></div></div>`; }); container.innerHTML = html; }
window.restoreRecycle = function(key) { let entry = allRecycleData.find(e => e.key === key); if(entry) { let dbEntry = {...entry}; delete dbEntry.key; set(ref(db, 'Ledger/' + key), dbEntry); remove(ref(db, 'RecycleBin/' + key)); } }
window.permanentlyDeleteRecycle = function(key) { if(confirm("Permanently delete this invoice? It cannot be recovered.")) { remove(ref(db, 'RecycleBin/' + key)); } }

window.renderLedgerEntries = function(name) { 
    let entryList = document.getElementById('ledger-entries-list'); 
    entryList.innerHTML = ''; 
    let totalGave = 0; 
    let totalGot = 0; 
    let customerEntries = allLedgerData.filter(e => e.name === name); 
    if(customerEntries.length === 0) { 
        entryList.innerHTML = `<div style="text-align:center; padding:30px; color:gray;">No entries yet.</div>`; 
    } else { 
        customerEntries.forEach(entry => { 
            let amt = parseFloat(entry.amount) || 0; 
            let gaveHtml = entry.type === 'Gave' ? `₹ ${amt}` : ''; 
            let gotHtml = entry.type === 'Got' ? `₹ ${amt}` : ''; 
            if(entry.type === 'Gave') totalGave += amt; 
            if(entry.type === 'Got') totalGot += amt; 
            let d = new Date(entry.date); 
            let dateStr = isNaN(d) ? entry.date : d.toLocaleString('en-GB', {day:'numeric', month:'short'}); 
            entryList.innerHTML += `<div class="entry-card" onclick="openEntryDetails('${entry.key}')"><div class="ec-left"><div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">${dateStr}</div><div style="font-size:13px; color:var(--text-dark); font-weight:500;">${entry.details || 'App Entry'}</div></div><div class="ec-gave">${gaveHtml}</div><div class="ec-got">${gotHtml}</div></div>`; 
        }); 
    } 
    
    let balEl = document.getElementById('l-deep-bal-amt'); 
    let txtEl = document.getElementById('l-deep-bal-text'); 
    let finalBal = totalGave - totalGot; 
    
    let isAdmin = (window.currentUserRole === 'admin');

    if(finalBal > 0) { 
        balEl.innerText = "₹ " + finalBal.toLocaleString(); 
        balEl.style.color = isAdmin ? "var(--success)" : "var(--danger)"; 
        txtEl.innerText = isAdmin ? "You will get" : "Due Payment"; 
    } else if (finalBal < 0) { 
        balEl.innerText = "₹ " + Math.abs(finalBal).toLocaleString(); 
        balEl.style.color = isAdmin ? "var(--danger)" : "var(--success)"; 
        txtEl.innerText = isAdmin ? "You will give" : "Advance Amount"; 
    } else { 
        balEl.innerText = "₹ 0"; 
        balEl.style.color = "var(--text-dark)"; 
        txtEl.innerText = "Settled"; 
    } 
}
window.renderCustomerList = function(list) { 
    let isAdmin = (window.currentUserRole === 'admin');
    let filteredList = list.filter(c => (c.type || 'Customer') === currentTabType); 
    let html = ""; 
    filteredList.forEach(cust => { 
        let initial = cust.name ? cust.name.substring(0,2).toUpperCase() : "CU"; 
        let adminPic = localStorage.getItem('v_adminPic'); 
        let custPic = cust.pic || adminPic; 
        let avatarHtml = custPic ? `<img src="${custPic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : initial; 
        let netBal = window.globalBalances[cust.name] || 0; 
        let balText = ""; 
        let balColor = ""; 
        
        if(netBal > 0) { 
            balText = isAdmin ? `₹${netBal.toLocaleString()} <span style="font-size:10px; color:var(--text-muted); font-weight:500;">(Get)</span>` : `₹${netBal.toLocaleString()} <span style="font-size:10px; color:var(--danger); font-weight:500;">(Due)</span>`; 
            balColor = isAdmin ? "var(--success)" : "var(--danger)"; 
        } else if(netBal < 0) { 
            balText = isAdmin ? `₹${Math.abs(netBal).toLocaleString()} <span style="font-size:10px; color:var(--text-muted); font-weight:500;">(Give)</span>` : `₹${Math.abs(netBal).toLocaleString()} <span style="font-size:10px; color:var(--success); font-weight:500;">(Advance)</span>`; 
            balColor = isAdmin ? "var(--danger)" : "var(--success)"; 
        } else { 
            balText = "₹0"; 
            balColor = "var(--text-muted)"; 
        } 
        
        html += `<div class="kb-list-item" onclick="openLedgerDetail('${cust.name}', '${cust.phone}')"><div class="kb-list-left"><div class="kb-avatar">${avatarHtml}</div><div><div class="kb-name">${cust.name}</div><div class="kb-time">📱 ${cust.phone || 'N/A'}</div></div></div><div class="kb-list-right" style="padding:16px 16px 16px 8px;"><div style="font-size:14px; font-weight:700; color:${balColor}; font-family:'Product Sans', sans-serif;">${balText}</div></div></div>`; 
    }); 
    document.getElementById('kb-customer-list').innerHTML = html || `<div style="padding:40px; text-align:center; color:gray;">No ${currentTabType}s found</div>`; 
}
    
window.openInvoicesPage = function() { let listContainer = document.getElementById('invoices-list-container'); listContainer.innerHTML = ''; let selectedDateString = document.getElementById('dash-date-picker').value; let todayInvoices = allLedgerData.filter(entry => { let entryDateString = ""; try { let d = new Date(entry.date); if (!isNaN(d)) entryDateString = d.toISOString().split('T')[0]; } catch(e){} return entryDateString === selectedDateString && entry.details && entry.details.includes("Invoice"); }); if(todayInvoices.length === 0) { listContainer.innerHTML = '<div style="text-align:center; padding:30px; color:gray; font-size:14px; font-weight:600;">No Bills found for this date.</div>'; } else { todayInvoices.forEach(entry => { listContainer.innerHTML += `<div class="entry-card" onclick="openEntryDetails('${entry.key}')" style="flex-direction:column; padding: 16px; border: 1px solid var(--border); margin-bottom: 12px; cursor:pointer;"><div style="display:flex; justify-content:space-between; margin-bottom: 8px;"><div style="font-weight:700; font-size: 15px; color:var(--text-dark);">${entry.name}</div><div style="color:var(--success); font-weight:800; font-size: 16px; font-family:'Product Sans', sans-serif;">₹${parseFloat(entry.amount).toLocaleString('en-IN')}</div></div><div style="font-size:12px; color:var(--text-muted); display:flex; justify-content:space-between;"><span>${entry.details}</span><span style="color:var(--primary); font-weight:600; display:flex; align-items:center;"><span class="material-symbols-rounded" style="font-size:16px;">visibility</span> View</span></div></div>`; }); } navTo('invoices-page', null); }

window.addSpecificStock = function(category, id1, id2, id3) { 
    let identifier = document.getElementById(id1).value.trim(); 
    let cone = parseFloat(document.getElementById(id2).value) || 0; 
    let kg = id3 ? (parseFloat(document.getElementById(id3).value) || 0) : 0; 
    
    if(!identifier || cone <= 0) return alert("Please enter valid Type/Box No. and Cone!"); 
    
    let key = category + "_" + identifier; 
    let itemRef = ref(db, 'Inventory/' + key); 
    
    get(itemRef).then((snap) => { 
        let cur = snap.val() || { cone: 0, kg: 0 }; 
        if(typeof cur === 'number') cur = { cone: cur, kg: 0 }; 
        set(itemRef, { cone: cur.cone + cone, kg: cur.kg + kg }); 
    }); 
    
    if(document.getElementById(id1).tagName !== 'SELECT') document.getElementById(id1).value = ''; 
    document.getElementById(id2).value = ''; 
    if(id3) document.getElementById(id3).value = ''; 
    
    alert("Stock Added (IN) Successfully!"); 
    document.getElementById(category.toLowerCase() + '-anim-form').classList.add('form-hidden'); 
}
window.filterStockList = function(inputId, listId) { let filter = document.getElementById(inputId).value.toUpperCase(); let rows = document.querySelectorAll('#' + listId + ' .stock-row'); rows.forEach(row => { let name = row.getAttribute('data-name'); row.style.display = name.includes(filter) ? '' : 'none'; }); }

function getGridCols(count) {
    if(count === 4) return 2;
    if(count === 6 || count === 9) return 3;
    return Math.min(4, Math.max(2, count));
}

function getLast5Tx(cat, item) {
    let list = [];
    allGodownTransfers.forEach(t => {
        if(t.cat === cat && t.item === item) {
            list.push({ date: t.date, type: t.type, qty: t.qty, party: 'Shop Transfer' });
        }
    });
    allLedgerData.forEach(e => {
        if(e.cart && e.type === 'Gave') {
            e.cart.forEach(c => {
                if(c.cat === cat && c.shade === item) {
                    list.push({ date: e.date, type: 'OUT', qty: c.qty, party: e.name });
                }
            });
        }
    });
    list.sort((a,b) => new Date(b.date) - new Date(a.date));
    return list.slice(0, 5);
}

window.renderInventoryList = function() { 
    let htmlMaps = { Thread: "", Zari: "", Nylon: "", Cording: "", Bobbin: "" };
    let countMaps = { Thread: 0, Zari: 0, Nylon: 0, Cording: 0, Bobbin: 0 };
    let itemsCount = { Thread: 0, Zari: 0, Nylon: 0, Cording: 0, Bobbin: 0 };
    let lowstockHtml = ""; let lowstockItemsCount = 0; let lowstockCount = 0;
    
    for (let key in smartInventory) { 
        let parts = key.split("_"); let cat = parts[0]; let shade = parts[1] || ""; let data = smartInventory[key]; 
        let coneQty = typeof data === 'object' ? data.cone : data;
        let kgQty = typeof data === 'object' ? data.kg : 0;
        let displayQty = typeof data === 'object' ? (kgQty > 0 ? `${coneQty} Cone, ${kgQty} KG` : `${coneQty} Cone`) : `${coneQty} Box`;

        if (htmlMaps[cat] !== undefined) {
            let txList = getLast5Tx(cat, shade);
            let txHtml = "";
            if(txList.length === 0) {
                txHtml = `<div class="inv-tx-item" style="justify-content:center; color:gray;">No recent transactions</div>`;
            } else {
                txList.forEach(tx => {
                    let isOut = tx.type === 'OUT' || tx.type === 'Gave';
                    let qClass = isOut ? 'out' : 'in';
                    let sign = isOut ? '-' : '+';
                    let dateStr = new Date(tx.date).toLocaleDateString('en-GB', {day:'numeric', month:'short'});
                    txHtml += `<div class="inv-tx-item"><span class="inv-tx-date">${dateStr}</span><span class="inv-tx-party">${tx.party}</span><span class="inv-tx-qty ${qClass}">${sign}${tx.qty}</span></div>`;
                });
            }
            htmlMaps[cat] += `<div class="inv-card stock-row" data-name="${shade.toUpperCase()}" onclick="toggleInvCard(this)">
                <div class="inv-card-header"><div class="inv-card-title">${shade}</div><div class="inv-card-qty" style="font-size:11px;">${displayQty}</div></div>
                <div class="inv-tx-list" onclick="event.stopPropagation()">${txHtml}</div>
            </div>`;
            countMaps[cat] += coneQty;
            itemsCount[cat]++;
        }

        if(coneQty <= 5 && coneQty > 0) { 
            lowstockCount++; lowstockItemsCount++;
            lowstockHtml += `<div class="inv-card stock-row" data-name="${shade.toUpperCase()}" onclick="toggleInvCard(this)" style="border-color:#f8cbcb;">
                <div class="inv-card-header"><div class="inv-card-title">${shade} <span style="font-size:10px;color:gray;">(${cat})</span></div><div class="inv-card-qty" style="color:var(--danger); background:#fdf2f2; font-size:11px;">${displayQty}</div></div>
                <div class="inv-tx-list" onclick="event.stopPropagation()"><div class="inv-tx-item" style="justify-content:center; color:var(--danger); font-weight:600;">Time to re-order!</div></div>
            </div>`;
        } 
    } 
    
    for(let cat in htmlMaps) {
        let el = document.getElementById(cat.toLowerCase() + '-stock-list');
        if(el) {
            el.style.gridTemplateColumns = `repeat(${getGridCols(itemsCount[cat])}, minmax(0, 1fr))`;
            el.innerHTML = htmlMaps[cat] || '<div style="grid-column:1/-1; text-align:center; padding:20px; color:gray;">No Stock Available</div>';
        }
        let valEl = document.getElementById('stock-val-' + cat.toLowerCase());
        if(valEl) valEl.innerText = countMaps[cat];
    }

    let lowEl = document.getElementById('lowstock-list');
    if(lowEl) {
        lowEl.style.gridTemplateColumns = `repeat(${getGridCols(lowstockItemsCount)}, minmax(0, 1fr))`;
        lowEl.innerHTML = lowstockHtml || '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--success); font-weight:600;">All stocks are healthy! 🎉</div>';
    }
    if(document.getElementById('stock-val-lowstock')) document.getElementById('stock-val-lowstock').innerText = lowstockCount;
}

window.shareLowStock = function() { let msg = "⚠️ *Low Stock Alert - Vandana Enterprises* ⚠️%0A%0A"; let hasLow = false; for (let key in smartInventory) { if(smartInventory[key] <= 5 && smartInventory[key] > 0) { let parts = key.split("_"); msg += `▪️ *${parts[1]}* (${parts[0]}) - Only ${smartInventory[key]} Box%0A`; hasLow = true; } } if(!hasLow) return alert("Everything is fully stocked! No low stock items to share."); window.open(`https://wa.me/?text=${msg}`, '_blank'); }

let currentCart = []; let grandInvoiceTotal = 0; let invoiceBoxCount = 0;

window.setPaymentMode = function(mode) {
    window.currentPaymentMode = mode;
    let btnPending = document.getElementById('pm-pending');
    let btnCash = document.getElementById('pm-cash');
    let btnOnline = document.getElementById('pm-online');
    let btnHalf = document.getElementById('pm-half');
    
    [btnPending, btnCash, btnOnline, btnHalf].forEach(btn => {
        if(btn) { btn.style.background = 'white'; btn.style.color = 'var(--text-dark)'; btn.style.borderColor = 'var(--border)'; }
    });

    document.getElementById('half-payment-container').style.display = 'none';
    document.getElementById('pos-dynamic-qr-box').style.display = 'none';
    let bankSelectContainer = document.getElementById('online-bank-select-container');
    if(bankSelectContainer) bankSelectContainer.style.display = 'none';

    if(mode === 'pending') {
        if(btnPending) { btnPending.style.background = '#fdf2f2'; btnPending.style.color = 'var(--danger)'; btnPending.style.borderColor = 'var(--danger)'; }
    } else if(mode === 'cash') {
        if(btnCash) { btnCash.style.background = '#e6f4ea'; btnCash.style.color = 'var(--success)'; btnCash.style.borderColor = 'var(--success)'; }
    } else if(mode === 'online' || mode === 'half') {
        if(mode === 'online' && btnOnline) { btnOnline.style.background = '#e8f0fe'; btnOnline.style.color = 'var(--primary)'; btnOnline.style.borderColor = 'var(--primary)'; }
        if(mode === 'half' && btnHalf) { btnHalf.style.background = '#fdf4e5'; btnHalf.style.color = '#b36b00'; btnHalf.style.borderColor = '#f29900'; document.getElementById('half-payment-container').style.display = 'flex'; }
        
        // Load Banks dynamically
        if(bankSelectContainer) {
            let bankHtml = "";
            if(typeof cbBanks !== 'undefined' && cbBanks.length > 0) {
                cbBanks.forEach(b => bankHtml += `<option value="${b.key}">${b.name}</option>`);
            } else {
                bankHtml = `<option value="">No Bank Added - Please add bank in Cashbook</option>`;
            }
            document.getElementById('inv-online-bank').innerHTML = bankHtml;
            bankSelectContainer.style.display = 'block';
        }
    }
    window.updateDynamicQR();
}

window.updateDynamicQR = function() {
    let qrBox = document.getElementById('pos-dynamic-qr-box');
    let upiId = localStorage.getItem('v_adminUpi');
    let onlineAmt = 0;

    if(window.currentPaymentMode === 'online') {
        onlineAmt = grandInvoiceTotal;
    } else if(window.currentPaymentMode === 'half') {
        let cashVal = parseFloat(document.getElementById('inv-cash-amt').value) || 0;
        let onlineVal = parseFloat(document.getElementById('inv-online-amt').value);
        
        if(isNaN(onlineVal) && cashVal > 0 && cashVal < grandInvoiceTotal) {
            onlineAmt = grandInvoiceTotal - cashVal;
        } else {
            onlineAmt = onlineVal || 0;
        }
    }

    if(upiId && onlineAmt > 0) {
        let safeAmount = parseFloat(onlineAmt).toFixed(2);
        let safeName = encodeURIComponent(localStorage.getItem('v_adminName') || "Vandana Enterprises");
        let upiString = `upi://pay?pa=${upiId}&pn=${safeName}&am=${safeAmount}&cu=INR`;
        document.getElementById('pos-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&ecc=H&margin=0&data=${encodeURIComponent(upiString)}`;
        document.getElementById('pos-qr-amount-text').innerText = `₹${safeAmount}`;
        qrBox.style.display = 'block';
    } else {
        qrBox.style.display = 'none';
    }
}

window.updatePosShades = function() { 
    let cat = document.getElementById('inv-cat').value; 
    let shadeSelect = document.getElementById('inv-shade'); 
    let qtyGroup = document.getElementById('pos-dynamic-inputs');
    
    shadeSelect.innerHTML = '<option value="">Select Item / Type</option>'; 
    if(!cat) return; 

    if(cat === 'Thread' || cat === 'Zari') {
        qtyGroup.innerHTML = `<input type="number" class="form-control" id="inv-cone" placeholder="Cone" style="border-radius:12px;"><input type="number" class="form-control" id="inv-rate" placeholder="Rate (₹)" style="border-radius:12px;">`;
    } else {
        qtyGroup.innerHTML = `<input type="number" class="form-control" id="inv-cone" placeholder="Cone" style="border-radius:12px;"><input type="number" class="form-control" id="inv-kg" placeholder="KG" style="border-radius:12px;"><input type="number" class="form-control" id="inv-rate" placeholder="Rate (₹)" style="border-radius:12px;">`;
    }

    for (let key in smartInventory) { 
        let parts = key.split("_"); 
        if(parts[0] === cat) { 
            let data = smartInventory[key];
            let coneQty = typeof data === 'object' ? data.cone : data;
            let kgQty = typeof data === 'object' ? data.kg : 0;
            if(coneQty > 0) { 
                let dis = kgQty > 0 ? `${coneQty} Cone, ${kgQty} KG` : `${coneQty} Cone`;
                shadeSelect.innerHTML += `<option value="${parts[1]}">${parts[1]} (${dis} Left)</option>`; 
            }
        } 
    } 
}

window.addCartItem = function() { 
    const cat = document.getElementById('inv-cat').value; 
    const shade = document.getElementById('inv-shade').value; 
    let cone = parseFloat(document.getElementById('inv-cone').value) || 0;
    let rate = parseFloat(document.getElementById('inv-rate').value) || 0;
    let kg = document.getElementById('inv-kg') ? (parseFloat(document.getElementById('inv-kg').value) || 0) : 0;

    if (!cat || !shade) return alert("Select Category and Item first!"); 
    if (cone <= 0 || rate <= 0) return alert("Enter valid Cone & Rate!"); 

    let key = cat + "_" + shade; 
    let cur = smartInventory[key] || { cone: 0, kg: 0 }; 
    if(typeof cur === 'number') cur = { cone: cur, kg: 0 };

    if(cone > cur.cone) { 
        alert(`OUT OF STOCK! You only have ${cur.cone} Cone left.`); return; 
    } 

    let displayQty = kg > 0 ? `${cone} Cone, ${kg} KG` : `${cone} Cone`;
    let itemTotal = kg > 0 ? (kg * rate) : (cone * rate); 

    currentCart.push({ cat: cat, shade: shade, title: `${cat} - ${shade}`, qty: displayQty, rawCone: cone, rawKg: kg, rate: rate, itemTotal: itemTotal }); 
    renderCartUi(); 
}

window.removeCartItem = function(index) {
    currentCart.splice(index, 1);
    renderCartUi();
};

window.editCartItem = function(index) {
    let item = currentCart[index];
    document.getElementById('inv-cat').value = item.cat;
    updatePosShades(); 
    setTimeout(() => { document.getElementById('inv-shade').value = item.shade; }, 150);
    
    document.getElementById('inv-qty').value = item.qty; // Assuming inv-qty was used in previous context, adjusted logic will re-fill cone/rate via other means or requires direct assignment to inv-cone
    // Correcting for the dynamic inputs:
    if(document.getElementById('inv-cone')) document.getElementById('inv-cone').value = item.rawCone;
    if(document.getElementById('inv-kg')) document.getElementById('inv-kg').value = item.rawKg;
    document.getElementById('inv-rate').value = item.rate;
    
    currentCart.splice(index, 1);
    renderCartUi();
    window.showSaaSToast("Item ready for editing!");
};

function renderCartUi() { 
    let tbody = document.getElementById('cart-rows'); 
    tbody.innerHTML = ''; 
    grandInvoiceTotal = 0; 
    invoiceBoxCount = 0; 
    currentCart.forEach((item, index) => { 
        grandInvoiceTotal += item.itemTotal; 
        invoiceBoxCount += item.qty; 
        tbody.innerHTML += `<tr>
            <td style="font-weight:600; color:var(--text-dark); font-size:13px;">${item.title}</td>
            <td style="text-align:center; font-size:13px; font-weight:600;">${item.qty}</td>
            <td style="text-align:center; font-size:13px;">₹${item.rate}</td>
            <td style="text-align:right; font-size:14px; color:var(--primary);"><strong>₹${item.itemTotal.toLocaleString()}</strong></td>
            <td style="text-align:center; white-space:nowrap;">
                <span class="material-symbols-rounded" style="color:#0a56d0; font-size:18px; cursor:pointer; vertical-align:middle; margin-right:6px; padding:6px; background:#e8f0fe; border-radius:8px; border:1px solid #c2e7ff; transition:0.2s;" onclick="editCartItem(${index})">edit</span>
                <span class="material-symbols-rounded" style="color:#b3261e; font-size:18px; cursor:pointer; vertical-align:middle; padding:6px; background:#fdf2f2; border-radius:8px; border:1px solid #f8cbcb; transition:0.2s;" onclick="removeCartItem(${index})">delete</span>
            </td>
        </tr>`; 
    }); 
    if(currentCart.length === 0) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-muted); font-weight:500;">🛒 Cart is empty. Add a product above.</td></tr>`;
    
    document.getElementById('cart-grand-total').innerText = `₹ ${grandInvoiceTotal.toLocaleString('en-IN')}`; 
    if(document.getElementById('inv-cone')) document.getElementById('inv-cone').value=''; 
    if(document.getElementById('inv-rate')) document.getElementById('inv-rate').value=''; 
    let btn = document.getElementById('save-bill-btn'); 
    if(btn) { 
        btn.innerHTML = window.editingBillNo ? `<span class="material-symbols-rounded" style="font-size:18px; vertical-align:middle;">update</span> Update Bill` : `<span class="material-symbols-rounded" style="font-size:18px; vertical-align:middle;">receipt_long</span> Generate Bill`; 
        btn.style.background = window.editingBillNo ? "var(--warning)" : "var(--primary)"; 
    }
    if(typeof window.updateDynamicQR === 'function') window.updateDynamicQR();
}

window.autoAdjustBillNumbers = function() {
    get(ref(db, 'Ledger')).then(snap => {
        let data = snap.val();
        if(!data) return;
        
        let invoices = [];
        for(let key in data) {
            if(data[key].details && data[key].details.includes("Invoice")) {
                invoices.push({ key: key, date: new Date(data[key].date).getTime(), details: data[key].details, billNo: data[key].billNo });
            }
        }
        
        invoices.sort((a,b) => a.date - b.date);
        
        let updates = {};
        let billMap = {}; 
        
        invoices.forEach((inv, index) => {
            let newBillNo = "VE " + String(index + 1).padStart(2, '0');
            if(inv.billNo !== newBillNo) {
                updates[inv.key + '/billNo'] = newBillNo;
                let parts = inv.details.split('-');
                if(parts.length > 1) {
                    updates[inv.key + '/details'] = `Invoice #${newBillNo} -` + parts.slice(1).join('-');
                }
                billMap[inv.billNo] = newBillNo;
            }
        });
        
        for(let key in data) {
            if(data[key].type === "Got" && data[key].details && data[key].details.includes("Payment against #")) {
                let match = data[key].details.match(/Payment against #(VE \d+)/);
                if(match && match[1] && billMap[match[1]]) {
                    updates[key + '/details'] = data[key].details.replace(match[1], billMap[match[1]]);
                }
            }
        }
        
        if(Object.keys(updates).length > 0) {
            update(ref(db, 'Ledger'), updates);
        }
    });
};

window.triggerSaveAndShare = function() { 
    if (currentCart.length === 0) return alert("Cart is empty!"); 
    
    let cAmt = 0;
    let oAmt = 0;

    if(window.currentPaymentMode === 'cash') {
        cAmt = grandInvoiceTotal;
    } else if (window.currentPaymentMode === 'online') {
        oAmt = grandInvoiceTotal;
    } else if (window.currentPaymentMode === 'half') {
        cAmt = parseFloat(document.getElementById('inv-cash-amt').value) || 0;
        let typedOnline = parseFloat(document.getElementById('inv-online-amt').value);
        if(isNaN(typedOnline) && cAmt > 0 && cAmt < grandInvoiceTotal) {
            oAmt = grandInvoiceTotal - cAmt;
        } else {
            oAmt = typedOnline || 0;
        }
    }

    let totalReceived = cAmt + oAmt;
    if(totalReceived > grandInvoiceTotal) return alert("Received amount cannot be greater than Total Bill amount!");

    let partyName = document.getElementById('inv-party').value.trim() || "Cash Sale"; 
    let partyPhone = document.getElementById('inv-phone').value.trim(); 
    
    if(partyName !== "Cash Sale") { 
        let exists = globalCustomers.find(c => c.name.toLowerCase() === partyName.toLowerCase()); 
        if(!exists) { 
            push(ref(db, 'Customers'), { name: partyName, phone: partyPhone || "", address: "", date: new Date().toISOString(), status: "Active", type: "Customer" }); 
        } 
    } 
    
    let isUpdating = !!window.editingEntryKey;
    
    currentCart.forEach(item => { 
        let key = item.cat + "_" + item.shade; 
        let itemRef = ref(db, 'Inventory/' + key); 
        get(itemRef).then(snap => { 
            let cur = snap.val() || {cone:0, kg:0};
            if(typeof cur === 'number') cur = {cone:cur, kg:0};
            let newCone = cur.cone - item.rawCone;
            let newKg = cur.kg - (item.rawKg || 0);
            if(newCone < 0) newCone = 0; if(newKg < 0) newKg = 0;
            set(itemRef, {cone: newCone, kg: newKg}); 
        }); 
    }); 
    
    let maxInv = 0;
    allLedgerData.forEach(e => { if(e.billNo && e.billNo.startsWith('VE ')) { let num = parseInt(e.billNo.replace('VE ', '')); if(!isNaN(num) && num > maxInv) maxInv = num; } });
    let tempBillNo = window.editingBillNo || ("VE " + String(maxInv + 1).padStart(2, '0'));
    
    let invDate = document.getElementById('inv-date').value; 
    if(!invDate) invDate = new Date().toISOString().split('T')[0];
    
    let [iYear, iMonth, iDay] = invDate.split('-');
    let invDateObj = new Date();
    invDateObj.setFullYear(iYear, iMonth - 1, iDay);
    let finalDateTime = invDateObj.toISOString();
    
    if (window.editingEntryKey) {
        let oldDateStr = new Date(window.editingEntryDate).toISOString().split('T')[0];
        if (oldDateStr === invDate) {
            finalDateTime = window.editingEntryDate;
        }
    }

    let breakdownData = { cash: cAmt, online: oAmt, pending: grandInvoiceTotal - totalReceived };

    let newEntry = { 
        date: finalDateTime, name: partyName, type: "Gave", amount: grandInvoiceTotal, 
        details: `Invoice #${tempBillNo} - ${invoiceBoxCount} Box`, cart: currentCart, 
        billNo: tempBillNo, breakdown: breakdownData 
    };
    
    document.getElementById('success-msg-title').innerText = isUpdating ? "Invoice Updated Successfully!" : "Bill Generated Successfully!";

    let savePromise;
    if (window.editingEntryKey) {
        savePromise = update(ref(db, 'Ledger/' + window.editingEntryKey), newEntry);
        window.lastGeneratedEntryData = { key: window.editingEntryKey, ...newEntry };
        window.editingEntryKey = null; 
    } else {
        let newRef = push(ref(db, 'Ledger'), newEntry); 
        window.lastGeneratedEntryData = { key: newRef.key, ...newEntry };
        savePromise = newRef;
    }

    // 🌟 यहाँ पर कैशबुक सिंक का लॉजिक 100% सही तरीके से लगा है
    // Get Selected Bank for POS
    let selectedBankKey = document.getElementById('inv-online-bank') ? document.getElementById('inv-online-bank').value : '';
    let selectedBankObj = typeof cbBanks !== 'undefined' ? cbBanks.find(b => b.key === selectedBankKey) : null;
    let bankName = selectedBankObj ? selectedBankObj.name : "Bank";

    savePromise.then(() => {
        let paymentPromises = [];
        if(cAmt > 0) {
            // 1. Ledger Entry
            let cashEntry = { date: finalDateTime, name: partyName, type: "Got", amount: cAmt, details: `Cash Received (Bill #${tempBillNo})` };
            paymentPromises.push(push(ref(db, 'Ledger'), cashEntry));
            
            // 2. Cashbook Entry (गल्ले में)
            paymentPromises.push(push(ref(db, 'CashBankBook/Transactions'), {
                date: finalDateTime, type: 'IN', amount: cAmt, mode: 'Cash', modeKey: 'Cash', details: `Bill Payment - ${partyName} (#${tempBillNo})`
            }));
        }
        if(oAmt > 0) {
            // 1. Ledger Entry
            let onlineEntry = { date: finalDateTime, name: partyName, type: "Got", amount: oAmt, details: `Online Payment Received (Bill #${tempBillNo})` };
            paymentPromises.push(push(ref(db, 'Ledger'), onlineEntry));

            // 2. Cashbook Entry (बैंक में)
            if (selectedBankObj) {
                paymentPromises.push(push(ref(db, 'CashBankBook/Transactions'), {
                    date: finalDateTime, type: 'IN', amount: oAmt, mode: bankName, modeKey: selectedBankKey, details: `Online Bill Payment - ${partyName} (#${tempBillNo})`
                }));
                let newBal = (parseFloat(selectedBankObj.balance) || 0) + oAmt;
                paymentPromises.push(update(ref(db, 'CashBankBook/Banks/' + selectedBankKey), { balance: newBal }));
            }
        }

        Promise.all(paymentPromises).then(() => {
            if(typeof window.autoAdjustBillNumbers === 'function') window.autoAdjustBillNumbers(); 
        });
    });
    .catch(err => {
        console.error("Save Error: ", err);
        alert("Error saving bill. Please try again.");
    });

    window.editingBillNo = null; 
    window.editingEntryDate = null;
    document.getElementById('billing-form-area').style.display = 'none'; 
    document.getElementById('post-bill-area').style.display = 'block';  
}

window.resetBillingPage = function() { 
    currentCart = []; 
    renderCartUi(); 
    window.editingBillNo = null; 
    window.editingEntryKey = null;
    window.editingEntryDate = null;
    document.getElementById('inv-date').value = new Date().toISOString().split('T')[0]; 
    document.getElementById('inv-party').value = ''; 
    document.getElementById('inv-phone').value = ''; 
    window.setPaymentMode('pending'); 
    if(document.getElementById('inv-cash-amt')) document.getElementById('inv-cash-amt').value = ''; 
    if(document.getElementById('inv-online-amt')) document.getElementById('inv-online-amt').value = ''; 
    document.getElementById('billing-form-area').style.display = 'block'; 
    document.getElementById('post-bill-area').style.display = 'none'; 
}

window.shareLastGeneratedInvoice = function() {
    if(window.lastGeneratedEntryData) {
        currentEntryData = window.lastGeneratedEntryData;
        shareCurrentEntryPDF();
    } else {
        alert("No recent bill found to share!");
    }
}

window.searchParties = function() { let filter = document.getElementById('party-search').value.toUpperCase(); document.querySelectorAll('#kb-customer-list .kb-list-item').forEach(item => { item.style.display = item.querySelector('.kb-name').innerText.toUpperCase().indexOf(filter) > -1 ? "" : "none"; }); }
window.openPhonebook = async function(nameId, phoneId) { if ('contacts' in navigator) { try { const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false }); if (contacts.length > 0) { if (contacts[0].name) document.getElementById(nameId).value = contacts[0].name[0]; if (contacts[0].tel) document.getElementById(phoneId).value = String(contacts[0].tel[0]).replace(/\D/g, '').slice(-10); } } catch(e) {} } }

function preparePDFData() {
    document.getElementById('pdf-biz-name').innerText = localStorage.getItem('v_adminName') || "Vandana Enterprises"; 
    document.getElementById('pdf-biz-phone').innerText = "Mob: +91 " + (localStorage.getItem('v_adminPhone') || "----------"); 
    
    let addr = localStorage.getItem('v_adminAddr');
    if(document.getElementById('pdf-biz-address')) {
        document.getElementById('pdf-biz-address').innerText = addr ? "Address: " + addr : "";
        document.getElementById('pdf-biz-address').style.display = addr ? "block" : "none";
    }
    
    let gst = localStorage.getItem('v_adminGst');
    document.getElementById('pdf-biz-gst').innerText = gst ? "GSTIN: " + gst : "";
    document.getElementById('pdf-biz-gst').style.display = gst ? "block" : "none";
    
    let d = new Date(currentEntryData.date); 
    document.getElementById('pdf-date').innerText = isNaN(d) ? currentEntryData.date : d.toLocaleDateString('en-GB'); 
    document.getElementById('pdf-bill-no').innerText = currentEntryData.billNo || currentEntryData.key.substring(1, 8).toUpperCase(); 
    document.getElementById('pdf-cust-name').innerText = currentEntryData.name;
    
    let totalBoxQty = 0;
    
    if(currentEntryData.cart && currentEntryData.cart.length > 0) {
        let html = ""; 
        currentEntryData.cart.forEach((item, index) => { 
            totalBoxQty += parseInt(item.qty) || 0; 
            
            html += `
                <tr>
                    <td style="padding:12px; border:1px solid #e0e2e0; text-align:center; font-size:14px; color:#1f1f1f; font-weight:600;">
                        ${index + 1}
                    </td>
                    <td style="padding:12px; border:1px solid #e0e2e0;">
                        <strong style="font-size:14px; color:#1f1f1f;">${item.cat}</strong><br>
                        <span style="font-size:12px; color:#718096;">Shade / Color: ${item.shade}</span>
                    </td>
                    <td style="padding:12px; border:1px solid #e0e2e0; text-align:center; font-size:14px; color:#1f1f1f; font-weight:600;">
                        ${item.qty} Box
                    </td>
                    <td style="padding:12px; border:1px solid #e0e2e0; text-align:right; font-size:14px; color:#1f1f1f;">
                        ₹${item.rate}
                    </td>
                    <td style="padding:12px; border:1px solid #e0e2e0; text-align:right; font-weight:700; font-size:14px; color:#1f1f1f;">
                        ₹${item.itemTotal.toLocaleString('en-IN')}
                    </td>
                </tr>
            `; 
        }); 
        
        html += `
            <tr style="background:#f8fafd; font-weight:bold;">
                <td colspan="2" style="padding:12px; border:1px solid #e0e2e0; text-align:right; font-size:14px; color:#0a56d0;">Total Quantity:</td>
                <td style="padding:12px; border:1px solid #e0e2e0; text-align:center; font-size:15px; color:#0a56d0; font-weight:800;">${totalBoxQty} Box</td>
                <td colspan="2" style="padding:12px; border:1px solid #e0e2e0;"></td>
            </tr>
        `;

        document.getElementById('pdf-cart-body').innerHTML = html;
        
        document.getElementById('pdf-table-header').innerHTML = `
            <tr style="background:#0a56d0; color:white;">
                <th style="padding:12px; text-align:center; font-size:14px; border:1px solid #0a56d0; width:60px;">Sr. No.</th>
                <th style="padding:12px; text-align:left; font-size:14px; border:1px solid #0a56d0;">Product Details</th>
                <th style="padding:12px; text-align:center; font-size:14px; border:1px solid #0a56d0;">Qty</th>
                <th style="padding:12px; text-align:right; font-size:14px; border:1px solid #0a56d0;">Rate</th>
                <th style="padding:12px; text-align:right; font-size:14px; border:1px solid #0a56d0;">Total Amount</th>
            </tr>
        `;
    } else {
        document.getElementById('pdf-table-header').innerHTML = `
            <tr style="background:#0a56d0; color:white;">
                <th style="padding:12px; text-align:center; font-size:14px; border:1px solid #0a56d0; width:60px;">Sr. No.</th>
                <th style="padding:12px; text-align:left; font-size:14px; border:1px solid #0a56d0;" colspan="3">Description / Details</th>
                <th style="padding:12px; text-align:right; font-size:14px; border:1px solid #0a56d0;">Total Amount</th>
            </tr>
        `; 
        document.getElementById('pdf-cart-body').innerHTML = `
            <tr>
                <td style="padding:16px 12px; border:1px solid #e0e2e0; text-align:center; font-weight:bold;">1</td>
                <td colspan="3" style="padding:16px 12px; border:1px solid #e0e2e0; font-size:14px; color:#1f1f1f;">${currentEntryData.details || 'Ledger Entry'}</td>
                <td style="padding:16px 12px; text-align:right; border:1px solid #e0e2e0; font-size:14px; font-weight:bold; color:#1f1f1f;">₹${parseFloat(currentEntryData.amount).toLocaleString('en-IN')}</td>
            </tr>
        `;
    }
    
    document.getElementById('pdf-total').innerText = "₹ " + parseFloat(currentEntryData.amount).toLocaleString('en-IN');
    
    if(currentEntryData.breakdown && document.getElementById('pdf-payment-breakdown')) {
        document.getElementById('pdf-payment-breakdown').style.display = 'flex';
        document.getElementById('pdf-paid-cash').innerText = "₹ " + (currentEntryData.breakdown.cash || 0).toLocaleString('en-IN');
        document.getElementById('pdf-paid-online').innerText = "₹ " + (currentEntryData.breakdown.online || 0).toLocaleString('en-IN');
        document.getElementById('pdf-pending-due').innerText = "₹ " + (currentEntryData.breakdown.pending || 0).toLocaleString('en-IN');
    } else if (document.getElementById('pdf-payment-breakdown')) {
        document.getElementById('pdf-payment-breakdown').style.display = 'none';
    }

    let qrContainer = document.getElementById('pdf-qr-container');
    let upiId = localStorage.getItem('v_adminUpi'); 
    
    let amountForQR = parseFloat(currentEntryData.amount) || 0;
    
    if(currentEntryData.breakdown && currentEntryData.breakdown.pending !== undefined) {
        amountForQR = parseFloat(currentEntryData.breakdown.pending);
    }

    if(upiId && amountForQR > 0) {
        let safeAmount = amountForQR.toFixed(2);
        let safeName = encodeURIComponent(localStorage.getItem('v_adminName') || "Vandana Enterprises");
        let upiString = `upi://pay?pa=${upiId}&pn=${safeName}&am=${safeAmount}&cu=INR`;
        
        document.getElementById('pdf-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&ecc=H&margin=0&data=${encodeURIComponent(upiString)}`;
        
        let qrLabel = document.getElementById('pdf-qr-label');
        if(!qrLabel) {
            qrContainer.style.border = "2px solid #0a56d0";
            qrContainer.style.background = "white";
            qrContainer.style.boxShadow = "0 8px 20px rgba(10,86,208,0.15)";
            
            qrContainer.insertAdjacentHTML('afterbegin', `
                <div id="pdf-qr-label" style="position:absolute; top:-26px; left:50%; transform:translateX(-50%); background:#0a56d0; color:white; border:2px solid white; font-size:12px; font-weight:800; padding:4px 12px; border-radius:20px; white-space:nowrap; box-shadow:0 4px 10px rgba(10,86,208,0.3); font-family:'Product Sans', sans-serif; z-index:10;">
                    PAY DUE: ₹${safeAmount}
                </div>
            `);
        } else {
            qrLabel.innerText = `PAY DUE: ₹${safeAmount}`;
        }

        qrContainer.style.display = 'block';
    } else {
        qrContainer.style.display = 'none';
    }
}

window.downloadPDFFromEntry = function() { 
    if(!currentEntryData) return; 
    preparePDFData(); 
    let elem = document.getElementById('pdf-invoice-template'); 
    let opt = { margin: [0.4, 0.4, 0.4, 0.4], filename: `Invoice_${currentEntryData.name.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`, image: { type: 'jpeg', quality: 1 }, html2canvas: { scale: 2, useCORS: true, windowWidth: 700 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } }; 
    alert("Generating PDF... Please wait a moment."); 
    setTimeout(() => { html2pdf().set(opt).from(elem).save(); }, 200); 
}

window.shareCurrentEntryPDF = async function() { 
    if(!currentEntryData) return; 
    preparePDFData(); 
    let elem = document.getElementById('pdf-invoice-template'); 
    let opt = { margin: [0.4, 0.4, 0.4, 0.4], filename: `Invoice_${currentEntryData.name.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`, image: { type: 'jpeg', quality: 1 }, html2canvas: { scale: 2, useCORS: true, windowWidth: 700 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } }; 
    alert("Preparing PDF for direct sharing... Please wait 2 seconds."); 
    setTimeout(async () => {
        try { 
            let pdfBlob = await html2pdf().set(opt).from(elem).output('blob'); 
            let file = new File([pdfBlob], opt.filename, { type: 'application/pdf' }); 
            if (navigator.canShare && navigator.canShare({ files: [file] })) { 
                await navigator.share({ files: [file], title: 'Invoice from Vandana Enterprises', text: `Please find attached your invoice (Total: ₹${currentEntryData.amount}).` }); 
            } else { 
                alert("Your browser does not support direct PDF sharing. Downloading instead..."); 
                html2pdf().set(opt).from(elem).save(); 
            } 
        } catch(e) { console.error(e); } 
    }, 200);
}

// ================= AUTO-LOGOUT SYSTEM (30 MIN INACTIVITY) =================
let inactivityTimer;
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        if (auth.currentUser) {
            signOut(auth).then(() => {
                alert("सुरक्षा कारणों से आपको लॉगआउट कर दिया गया है (30 मिनट से कोई एक्टिविटी नहीं थी)।");
                window.location.reload(); 
            }).catch(err => console.error("Logout Error:", err));
        }
    }, 1800000); 
}

window.addEventListener('mousemove', resetInactivityTimer);
window.addEventListener('keypress', resetInactivityTimer);
window.addEventListener('click', resetInactivityTimer);
window.addEventListener('scroll', resetInactivityTimer, true);
window.addEventListener('touchmove', resetInactivityTimer);

resetInactivityTimer();

// ================= MANUAL LOGOUT =================
window.manualLogout = function() {
    if(confirm("क्या आप सच में लॉगआउट करना चाहते हैं?")) {
        signOut(auth).then(() => {
            window.location.reload(); 
        }).catch(err => console.error("Logout Error:", err));
    }
}

// ================= NEW CUSTOMER DETAILS SUBMIT =================
window.submitNewCustomerDetails = function() {
    let phone = document.getElementById('nc-phone').value.trim();
    let address = document.getElementById('nc-address').value.trim();
    let user = auth.currentUser;

    if(!phone || phone.length < 10) return alert("कृपया सही 10-अंकों का मोबाइल नंबर डालें!");
    if(!address) return alert("कृपया अपनी दुकान का नाम और पता डालें!");

    if(user) {
        let btn = document.getElementById('nc-submit-btn');
        btn.innerText = "Saving...";
        
        const userRef = ref(db, 'AppUsers/' + user.uid);
        
        update(userRef, {
            phone: phone,
            address: address
        }).then(() => {
            window.currentUserPhone = phone;
            if(typeof window.applyDataFiltering === 'function') window.applyDataFiltering();
            
            document.getElementById('new-customer-popup').style.display = 'none';
            alert("आपकी डिटेल्स सेव हो गई हैं! अब आप ऐप देख सकते हैं।");
        }).catch(err => {
            console.error(err);
            alert("Error saving details.");
            btn.innerText = "Save & Continue";
        });
    }
}

// ================= ROLE-BASED ACCESS CONTROL (RBAC) =================
window.applyRoleBasedAccess = function(role) {
    let isAdmin = (role === 'admin');
    let hamburgerBtn = document.getElementById('main-hamburger');
    if (hamburgerBtn) {
        hamburgerBtn.style.display = isAdmin ? 'block' : 'none';
    }
    
    let invNav = document.getElementById('nav-btn-inventory');
    if (invNav) {
        invNav.style.display = isAdmin ? 'flex' : 'none';
    }
    
    let myBillsNav = document.getElementById('nav-btn-mybills');
    if (myBillsNav) {
        myBillsNav.style.display = isAdmin ? 'none' : 'flex';
    }

    let ledgerNavSpan = document.querySelector('#nav-btn-ledger span');
    if (ledgerNavSpan) {
        ledgerNavSpan.innerText = isAdmin ? 'Ledger' : 'My Khata';
    }
        
    let isSupplier = (role === 'supplier');

    let adminCards = document.getElementById('admin-action-cards');
    if (adminCards) {
        adminCards.style.display = isAdmin ? 'grid' : 'none';
    }

    let topCustContainer = document.getElementById('top-customers-container');
    if(topCustContainer) {
        topCustContainer.style.display = isSupplier ? 'none' : 'block';
    }

    let tcTabs = document.getElementById('tc-tabs');
    let tcTitle = document.getElementById('tc-title');
    if(tcTabs) tcTabs.style.display = isAdmin ? 'flex' : 'none';
    if(tcTitle) tcTitle.innerHTML = isAdmin ? 'Top Customers 🏆 <span style="font-size:10px; color:var(--danger); background:#fdf2f2; padding:2px 6px; border-radius:4px; border:1px solid #f8cbcb;">2% OFF</span>' : 'My Target Progress 🎯 <span style="font-size:10px; color:var(--danger); background:#fdf2f2; padding:2px 6px; border-radius:4px; border:1px solid #f8cbcb;">2% OFF</span>';
    
    document.querySelectorAll('.pro-add-btn').forEach(btn => {
        btn.style.display = isAdmin ? 'flex' : 'none';
    });

    document.querySelectorAll('.in-out-btn-group').forEach(group => {
        group.style.display = isAdmin ? 'flex' : 'none';
    });

    let mainFab = document.getElementById('main-fab');
    if (mainFab) mainFab.style.display = isAdmin ? 'flex' : 'none';

    let ledgerBottomBar = document.querySelector('#ledger-deep-page .bottom-action-bar');
    let btnGave = document.querySelector('.btn-l-gave');
    let btnGot = document.querySelector('.btn-l-got');
    
    if (ledgerBottomBar) {
        let isSupplier = (window.currentUserRole === 'supplier');
        ledgerBottomBar.style.display = (isAdmin || isSupplier) ? 'flex' : 'none';
        
        if (isSupplier && !isAdmin) {
            btnGave.innerText = "Send Payment Request ₹";
            btnGot.style.display = 'none';
        } else if (isAdmin) {
            btnGave.innerText = "YOU GAVE ₹";
            btnGot.style.display = 'block';
            btnGot.innerText = "YOU GOT ₹";
        }
    }
    
    let entryEditBtn = document.getElementById('ed-edit-btn-container');
    if(entryEditBtn) entryEditBtn.style.display = isAdmin ? 'block' : 'none';

    let entryDeleteBtn = document.querySelector('button[onclick="deleteCurrentEntry()"]');
    if(entryDeleteBtn) entryDeleteBtn.style.display = isAdmin ? 'inline-block' : 'none';

    let cpDeleteBar = document.getElementById('cp-delete-bar');
    if(cpDeleteBar) cpDeleteBar.style.display = isAdmin ? 'flex' : 'none';

    document.querySelectorAll('.sidebar-menu li').forEach(li => {
        let onclickText = li.getAttribute('onclick') || "";
        if(onclickText.includes('recycle-page') || onclickText.includes('openAbsentCustomers') || onclickText.includes('stock') || onclickText.includes('cashbook-page')) {
            li.style.display = isAdmin ? 'flex' : 'none';
        }
    });

    let pmManageBtn = document.getElementById('pm-manage-btn');
    if (pmManageBtn) pmManageBtn.style.display = isAdmin ? 'none' : 'flex';

    let manageUsersNav = document.getElementById('manage-users-nav');
    if(manageUsersNav) manageUsersNav.style.display = isAdmin ? 'flex' : 'none';
}

window.showTargetCelebration = function() {
    document.getElementById('target-modal').style.display = 'flex';
    var duration = 5000;
    var animationEnd = Date.now() + duration;
    var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100000 };
    var interval = setInterval(function() {
        var timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        var particleCount = 50 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
    }, 250);
}

window.currentBulkBills = []; 

window.renderMyBillsList = function() {
    let fromD = document.getElementById('mb-from').value;
    let toD = document.getElementById('mb-to').value;
    
    if (!fromD || !toD) {
        let today = new Date();
        let firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        fromD = firstDay.toISOString().split('T')[0];
        toD = today.toISOString().split('T')[0];
        document.getElementById('mb-from').value = fromD;
        document.getElementById('mb-to').value = toD;
    }

    let fDate = new Date(fromD);
    let tDate = new Date(toD);
    let diffDays = (tDate - fDate) / (1000 * 60 * 60 * 24);
    
    if (diffDays > 62) {
        alert("आप एक साथ अधिकतम 2 महीने के बिल ही देख सकते हैं। कृपया कम तारीख सेलेक्ट करें।");
        document.getElementById('mb-to').value = fromD; 
        return;
    }

    let listContainer = document.getElementById('mybills-list-container');
    listContainer.innerHTML = '';
    let totalBillValue = 0;

    let myCustName = globalCustomers.length > 0 ? globalCustomers[0].name : window.currentUserName;
    
    let myBills = window.rawLedger.filter(entry => {
        if (entry.name !== myCustName || !entry.details || !entry.details.includes("Invoice")) return false;
        let eTime = new Date(entry.date).getTime();
        return eTime >= fDate.getTime() && eTime <= (tDate.getTime() + 86399000); 
    });

    myBills.sort((a, b) => {
        let aNum = parseInt(a.billNo ? a.billNo.replace(/\D/g,'') : 0);
        let bNum = parseInt(b.billNo ? b.billNo.replace(/\D/g,'') : 0);
        return aNum - bNum;
    });

    window.currentBulkBills = myBills; 

    if (myBills.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding:40px 20px; color:gray;">इस समय सीमा में कोई बिल नहीं मिला।</div>`;
    } else {
        myBills.forEach(entry => {
            let amt = parseFloat(entry.amount) || 0;
            totalBillValue += amt;
            let d = new Date(entry.date);
            let dateStr = isNaN(d) ? entry.date : d.toLocaleString('en-GB', {day:'numeric', month:'short', year:'numeric'});

            listContainer.innerHTML += `
                <div class="entry-card" onclick="openEntryDetails('${entry.key}')" style="flex-direction:column; padding: 16px; border: 1px solid var(--border); margin-bottom: 12px; cursor:pointer;">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                        <div style="font-weight:700; font-size: 15px;">${dateStr} <span style="font-size:12px; color:gray;">(${entry.billNo})</span></div>
                        <div style="color:var(--success); font-weight:800; font-size: 16px;">₹${amt.toLocaleString('en-IN')}</div>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted);">${entry.details}</div>
                </div>`;
        });
    }
    document.getElementById('mybills-count').innerText = myBills.length;
    document.getElementById('mybills-value').innerText = `₹ ${totalBillValue.toLocaleString('en-IN')}`;
}

window.currentZoom = 0.52;
window.changeZoom = function(amount) {
    let area = document.getElementById('preview-render-area');
    window.currentZoom += amount;
    if(window.currentZoom < 0.2) window.currentZoom = 0.2; 
    if(window.currentZoom > 1.5) window.currentZoom = 1.5; 
    area.style.zoom = window.currentZoom;
}

window.previewBulkPDF = function() {
    let myBills = window.currentBulkBills || [];
    
    if (myBills.length === 0) {
        alert("इस तारीख के बीच आपका कोई बिल नहीं है!");
        return;
    }

    let adminName = localStorage.getItem('v_adminName') || "Vandana Enterprises";
    let adminPhone = localStorage.getItem('v_adminPhone') || "----------";
    let adminGst = localStorage.getItem('v_adminGst') || "";

    let allBillsHtml = ""; 

    myBills.forEach((bill, index) => {
        let amt = parseFloat(bill.amount) || 0;
        let d = new Date(bill.date);
        let dateStr = isNaN(d) ? bill.date : d.toLocaleDateString('en-GB');
        
        let cartHtml = "";
        if(bill.cart && bill.cart.length > 0) {
            bill.cart.forEach(item => {
                cartHtml += `
                    <tr>
                        <td style="padding:12px; border:1px solid #e0e2e0;">
                            <strong style="font-size:14px; color:#1f1f1f;">${item.cat}</strong><br>
                            <span style="font-size:12px; color:#718096;">Shade / Color: ${item.shade}</span>
                        </td>
                        <td style="padding:12px; border:1px solid #e0e2e0; text-align:center; font-size:14px; color:#1f1f1f;">
                            ${item.qty} Box
                        </td>
                        <td style="padding:12px; border:1px solid #e0e2e0; text-align:right; font-size:14px; color:#1f1f1f;">
                            ₹${item.rate}
                        </td>
                        <td style="padding:12px; border:1px solid #e0e2e0; text-align:right; font-weight:700; font-size:14px; color:#1f1f1f;">
                            ₹${item.itemTotal.toLocaleString('en-IN')}
                        </td>
                    </tr>
                `;
            });
        } else {
            cartHtml = `
                <tr>
                    <td colspan="3" style="padding:12px; border:1px solid #e0e2e0; font-size:14px; color:#1f1f1f;">${bill.details || 'Ledger Entry / Goods'}</td>
                    <td style="padding:12px; border:1px solid #e0e2e0; text-align:right; font-weight:700; font-size:14px; color:#1f1f1f;">₹${amt.toLocaleString('en-IN')}</td>
                </tr>
            `;
        }

        let pageBreak = index < myBills.length - 1 ? 'page-break-after: always; break-after: page;' : '';

        allBillsHtml += `
            <div style="background:white; padding:40px; font-family:'Product Sans', 'Inter', sans-serif; color:black; width:100%; max-width:720px; min-height:1020px; margin: 0 auto; box-sizing:border-box; border:1px solid #e0e2e0; margin-bottom: 20px; position:relative; box-shadow: 0 4px 15px rgba(0,0,0,0.05); ${pageBreak}">
                <div style="display:flex; justify-content:space-between; border-bottom:3px solid #0a56d0; padding-bottom:20px; margin-bottom:30px;">
                    <div>
                        <h1 style="color:#0a56d0; margin:0; font-size:28px; font-weight:800; text-transform:uppercase; letter-spacing:-0.5px;">${adminName}</h1>
                        <p style="margin:8px 0 0 0; font-size:14px; color:#444746; font-weight:500;">Mob: +91 ${adminPhone}</p>
                        ${localStorage.getItem('v_adminAddr') ? `<p style="margin:4px 0 0 0; font-size:14px; color:#444746; font-weight:500;">Address: ${localStorage.getItem('v_adminAddr')}</p>` : ''}
                        ${adminGst ? `<p style="margin:4px 0 0 0; font-size:14px; color:#444746; font-weight:500;">GSTIN: ${adminGst}</p>` : ''}
                    </div>
                    
                    <div style="text-align:right;">
                        <h2 style="margin:0; font-size:36px; color:#1f1f1f; letter-spacing:1px; text-transform:uppercase;">INVOICE</h2>
                        <p style="margin:12px 0 0 0; font-size:15px; font-weight:700;">Bill No: <span style="color:#b3261e;">${bill.billNo || '-'}</span></p>
                        <p style="margin:4px 0 0 0; font-size:14px; color:#444746; font-weight:500;">Date: ${dateStr}</p>
                    </div>
                </div>

                <div style="background:#f8fafd; padding:20px; border-radius:12px; border:1px solid #c2e7ff; margin-bottom:30px;">
                    <h3 style="margin:0 0 8px 0; font-size:12px; color:#718096; text-transform:uppercase; letter-spacing:1px;">BILLED TO:</h3>
                    <p style="margin:0; font-size:22px; font-weight:700; color:#1f1f1f;">${bill.name}</p>
                </div>

                <table style="width:100%; border-collapse:collapse; margin-bottom:40px;">
                    <thead>
                        <tr style="background:#0a56d0; color:white;">
                            <th style="padding:12px; text-align:left; font-size:14px; border:1px solid #0a56d0;">Product Details</th>
                            <th style="padding:12px; text-align:center; font-size:14px; border:1px solid #0a56d0;">Qty</th>
                            <th style="padding:12px; text-align:right; font-size:14px; border:1px solid #0a56d0;">Rate</th>
                            <th style="padding:12px; text-align:right; font-size:14px; border:1px solid #0a56d0;">Total Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cartHtml}
                    </tbody>
                </table>

                <div style="display:flex; justify-content:flex-end; margin-bottom:40px;">
                    <div style="width:350px;">
                        <div style="display:flex; justify-content:space-between; padding:18px 20px; background:#f0f4f9; font-weight:800; font-size:24px; border-radius:12px; border:1px solid #c2e7ff; color:#0a56d0;">
                            <span>Grand Total:</span><span>₹ ${amt.toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                </div>

                <div style="position:absolute; bottom:40px; left:40px; right:40px; border-top:2px dashed #e0e2e0; padding-top:20px; display:flex; justify-content:space-between; align-items:flex-end;">
                    <div style="color:#718096; font-size:13px; font-weight:500;">
                        <p style="margin:0 0 4px 0; color:#1f1f1f; font-weight:600; font-size:15px;">Thank you for your business!</p>
                        <p style="margin:0;">Report generated via Vandana ERP Software</p>
                    </div>
                    <div style="text-align:right; color:#1f1f1f; font-size:15px; font-weight:700;">
                        Authorized Signatory
                    </div>
                </div>
            </div>
        `;
    });

    let renderArea = document.getElementById('preview-render-area');
    renderArea.innerHTML = `<div id="all-a4-bills-container" style="background:#e0e2e0; padding:20px 0;">${allBillsHtml}</div>`; 
    
    window.currentReportElemId = 'all-a4-bills-container'; 
    window.currentReportFilename = `Invoices_${new Date().getTime()}.pdf`; 
    
    let filterBox = document.getElementById('date-filter-box');
    if(filterBox) filterBox.style.display = 'none';
    
    window.currentZoom = 0.45;
    renderArea.style.zoom = window.currentZoom;

    openPage('report-preview-page');
}

window.toggleDateFilter = function() {
    let filterBox = document.getElementById('date-filter-box');
    if (filterBox.style.display === 'none') {
        filterBox.style.display = 'block'; 
    } else {
        filterBox.style.display = 'none';  
    }
}

window.openVerificationPage = function() {
    if(typeof renderPendingRequests === 'function') renderPendingRequests();
    openPage('verification-page');
}

window.renderPendingRequests = function() {
    let container = document.getElementById('pending-requests-list');
    if (allPendingRequests.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px 20px; color:gray;">कोई पेंडिंग रिक्वेस्ट नहीं है 🎉</div>`;
        return;
    }
    
    // Create Bank Options
    let bankOptionsHtml = `<option value="Cash">Cash (गल्ला)</option>`;
    if(typeof cbBanks !== 'undefined') {
        cbBanks.forEach(b => {
            bankOptionsHtml += `<option value="${b.key}">${b.name} (Bank)</option>`;
        });
    }

    let html = "";
    allPendingRequests.forEach(req => {
        let d = new Date(req.date);
        let dateStr = isNaN(d) ? req.date : d.toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
        let color = req.type === 'Gave' ? 'var(--danger)' : 'var(--success)';
        let typeText = req.type === 'Gave' ? 'Bill / Entry' : 'Payment Received';
        
        html += `
        <div class="entry-card" style="flex-direction:column; padding: 16px; border: 1px solid var(--border); margin-bottom: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                <div>
                    <div style="font-weight:700; font-size: 15px; color:var(--text-dark);">${req.name}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${dateStr}</div>
                </div>
                <div style="text-align:right;">
                    <div style="color:${color}; font-weight:800; font-size: 16px;">₹${parseFloat(req.amount).toLocaleString('en-IN')}</div>
                    <div style="font-size:11px; font-weight:600; color:${color};">${typeText}</div>
                </div>
            </div>
            <div style="font-size:13px; color:var(--text-muted); margin-bottom:12px; background:#f8fafd; padding:10px; border-radius:8px; border:1px solid #e0e2e0;">
                <strong>Details:</strong> ${req.details || 'N/A'} <br>
                <span style="font-size:11px; color:#0a56d0;">(Sent by: ${req.requestedBy || 'Unknown'})</span>
            </div>
            
            <div style="margin-bottom:12px; background:#f0f4f9; padding:10px; border-radius:12px; border:1px solid #c2e7ff;">
                <label style="font-size:11px; font-weight:700; color:var(--primary-dark); margin-bottom:6px; display:block;">🏦 पैसा कहाँ जमा करना है?</label>
                <select id="approve-mode-${req.key}" class="form-control" style="padding:10px; border-radius:8px; border-color:var(--primary); font-size:13px; background:white; font-weight:600; color:var(--primary-dark);">
                    ${bankOptionsHtml}
                </select>
            </div>

            <div style="display:flex; gap:10px;">
                <button class="btn-outline" style="flex:1; border-color:var(--danger); color:var(--danger); padding:10px; border-radius:12px; font-size:13px; font-weight:600;" onclick="rejectRequest('${req.key}')">❌ Reject</button>
                <button class="btn-submit" style="flex:1; background:var(--success); padding:10px; border-radius:12px; font-size:13px; font-weight:600; box-shadow:0 4px 10px rgba(20, 108, 46, 0.2);" onclick="approveRequest('${req.key}')">✅ Approve</button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

window.approveRequest = function(key) {
    if(!confirm("क्या आप इस रिक्वेस्ट को अप्रूव करके लेजर और कैशबुक में जोड़ना चाहते हैं?")) return;
    let req = allPendingRequests.find(r => r.key === key);
    if(!req) return;

    let modeSelect = document.getElementById(`approve-mode-${key}`);
    let selectedModeKey = modeSelect ? modeSelect.value : 'Cash';
    let modeName = "Cash";

    let newEntry = { ...req };
    delete newEntry.key;
    delete newEntry.status;
    delete newEntry.requestedBy;
    
    let promises = [];
    
    // 1. Add to Ledger
    promises.push(push(ref(db, 'Ledger'), newEntry));

    // 2. Add to Cashbook & Update Bank Balance
    let amt = parseFloat(req.amount) || 0;
    let cbType = req.type === 'Got' ? 'IN' : 'OUT'; // Customer pays, so it's 'Got' (Money IN)
    
    if (selectedModeKey !== 'Cash') {
        let bank = typeof cbBanks !== 'undefined' ? cbBanks.find(b => b.key === selectedModeKey) : null;
        if (bank) {
            modeName = bank.name;
            let newBal = req.type === 'Got' ? (bank.balance + amt) : (bank.balance - amt);
            promises.push(update(ref(db, 'CashBankBook/Banks/' + bank.key), { balance: newBal }));
        }
    }
    
    promises.push(push(ref(db, 'CashBankBook/Transactions'), {
        date: req.date || new Date().toISOString(),
        type: cbType,
        amount: amt,
        mode: modeName,
        modeKey: selectedModeKey,
        details: `Customer Online Payment - ${req.name}`
    }));

    // 3. Remove from PendingRequests
    promises.push(remove(ref(db, 'PendingRequests/' + key)));

    Promise.all(promises).then(() => {
        alert("रिक्वेस्ट सफलतापूर्वक अप्रूव और कैशबुक में ऐड हो गई है! ✅");
    }).catch(err => alert("Error: " + err.message));
}

window.rejectRequest = function(key) {
    if(!confirm("क्या आप इस रिक्वेस्ट को रिजेक्ट (डिलीट) करना चाहते हैं?")) return;
    remove(ref(db, 'PendingRequests/' + key)).then(() => {
        alert("रिक्वेस्ट रिजेक्ट कर दी गई है! ❌");
    }).catch(err => alert("Error: " + err.message));
}

window.renderManageUsers = function() {
    let container = document.getElementById('manage-users-list');
    if(!container) return;
    if(window.allAppUsers.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px 20px; color:gray;">कोई यूजर नहीं मिला।</div>`;
        return;
    }
    let html = "";
    window.allAppUsers.forEach(u => {
        let badgeColor = u.role === 'admin' ? 'var(--primary)' : (u.role === 'pending' ? 'var(--warning)' : 'var(--success)');
        html += `
        <div class="entry-card" style="flex-direction:column; padding: 16px; border: 1px solid var(--border); margin-bottom: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${u.photo || 'https://www.svgrepo.com/show/384674/account-avatar-profile-user-11.svg'}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
                    <div>
                        <div style="font-weight:700; font-size: 15px; color:var(--text-dark);">${u.name}</div>
                        <div style="font-size:11px; color:var(--text-muted);">${u.email} <br> 📱 ${u.phone || 'N/A'}</div>
                    </div>
                </div>
                <div style="background:${badgeColor}; color:white; padding:4px 8px; border-radius:8px; font-size:11px; font-weight:bold; text-transform:uppercase;">${u.role}</div>
            </div>
            <div style="margin-bottom:12px; font-size:12px; color:var(--text-muted);">
                <strong>Address:</strong> ${u.address || 'N/A'}
            </div>
            <div style="display:flex; gap:8px;">
                <select class="form-control" id="role-${u.uid}" style="flex:1; padding:8px; font-size:13px; border-radius:8px;">
                    <option value="pending" ${u.role === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="Customer" ${u.role === 'Customer' ? 'selected' : ''}>Customer</option>
                    <option value="supplier" ${u.role === 'supplier' ? 'selected' : ''}>Supplier</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                <button class="btn-submit" style="background:var(--primary-dark); padding:8px 16px; border-radius:8px; font-size:13px;" onclick="updateUserRole('${u.uid}', '${u.name}')">Update</button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

window.updateUserRole = function(uid, name) {
    let newRole = document.getElementById(`role-${uid}`).value;
    if(!confirm(`क्या आप सच में ${name} का रोल ${newRole} करना चाहते हैं?`)) return;
    
    update(ref(db, 'AppUsers/' + uid), { role: newRole }).then(() => {
        alert(`${name} का रोल सफलतापूर्वक अपडेट हो गया है! ✅`);
        if(newRole === 'Customer' || newRole === 'supplier') {
            let exists = globalCustomers.find(c => c.name.toLowerCase() === name.toLowerCase());
            if(!exists) {
                let userObj = window.allAppUsers.find(u => u.uid === uid);
                push(ref(db, 'Customers'), {
                    name: userObj.name,
                    phone: userObj.phone || "",
                    address: userObj.address || "",
                    date: new Date().toISOString(),
                    status: "Active",
                    type: newRole === 'supplier' ? 'Supplier' : 'Customer'
                });
            }
        }
    }).catch(err => alert("Error: " + err.message));
}

window.processGdPayment = function(payType) {
    let dateVal = document.getElementById('gd-pay-date').value || new Date().toISOString().split('T')[0];
    let amount = parseFloat(document.getElementById('gd-pay-amount').value);
    let details = document.getElementById('gd-pay-details').value || "Account Settlement";

    if(isNaN(amount) || amount <= 0) return alert("Please enter a valid amount!");

    let [year, month, day] = dateVal.split('-');
    let dObj = new Date(); dObj.setFullYear(year, parseInt(month) - 1, day);
    let finalDateTime = dObj.toISOString();

    push(ref(db, 'GodownTransfers'), { 
        date: finalDateTime, 
        cat: 'Payment', 
        item: details, 
        qty: 0, 
        rate: 0,
        amount: amount,
        type: 'Payment_' + payType 
    }); 
    
    document.getElementById('gd-pay-amount').value = ''; 
    document.getElementById('gd-pay-details').value = ''; 
    document.getElementById('gd-payment-panel').classList.add('form-hidden'); 
    alert("Payment recorded successfully!");
}

window.deleteGdTransfer = function(key, type, cat, item, qty) {
    if(!confirm("Are you sure you want to delete this entry?")) return;
    
    let invKey = cat + "_" + item;
    let itemRef = ref(db, 'Inventory/' + invKey);
    get(itemRef).then(snap => {
        let cur = snap.val() || {cone:0, kg:0};
        if(typeof cur === 'number') cur = {cone:cur, kg:0};
        let newConeQty = type === 'OUT' ? cur.cone + qty : cur.cone - qty;
        if(newConeQty < 0) newConeQty = 0;
        set(itemRef, {cone: newConeQty, kg: cur.kg});
    });
    
    remove(ref(db, 'GodownTransfers/' + key)).then(() => {
        alert("Entry Deleted!");
    });
}

window.editGdTransfer = function(key) {
    let entry = allGodownTransfers.find(t => t.key === key);
    if(!entry) return;
    
    let invKey = entry.cat + "_" + entry.item;
    let itemRef = ref(db, 'Inventory/' + invKey);
    get(itemRef).then(snap => {
        let cur = snap.val() || {cone:0, kg:0};
        if(typeof cur === 'number') cur = {cone:cur, kg:0};
        let newConeQty = entry.type === 'OUT' ? cur.cone + entry.qty : cur.cone - entry.qty;
        if(newConeQty < 0) newConeQty = 0;
        set(itemRef, {cone: newConeQty, kg: cur.kg});
    });

    document.getElementById('gd-edit-key').value = entry.key;
    document.getElementById('gd-date').value = new Date(entry.date).toISOString().split('T')[0];
    document.getElementById('gd-cat').value = entry.cat;
    document.getElementById('gd-item').value = entry.item;
    document.getElementById('gd-qty').value = entry.qty;
    document.getElementById('gd-rate').value = entry.rate;

    document.getElementById('gd-form-panel').classList.remove('form-hidden');

    if(entry.type === 'IN') {
        document.getElementById('gd-btn-out').style.display = 'none';
        document.getElementById('gd-btn-in').style.display = 'block';
        document.getElementById('gd-btn-in').innerText = 'UPDATE IN';
    } else {
        document.getElementById('gd-btn-in').style.display = 'none';
        document.getElementById('gd-btn-out').style.display = 'block';
        document.getElementById('gd-btn-out').innerText = 'UPDATE OUT';
    }
    window.scrollTo(0,0);
}

window.shareGdChallan = async function(key) {
    let entry = allGodownTransfers.find(t => t.key === key);
    if(!entry) return;

    document.getElementById('pdf-gd-biz').innerText = localStorage.getItem('v_adminName') || "Vandana Enterprises";
    let d = new Date(entry.date);
    document.getElementById('pdf-gd-date').innerText = isNaN(d) ? entry.date : d.toLocaleDateString('en-GB');
    document.getElementById('pdf-gd-item').innerHTML = `<strong style="font-size:14px; color:#1f1f1f;">${entry.cat}</strong><br><span style="font-size:12px; color:#718096;">Shade / Color: ${entry.item}</span>`;
    document.getElementById('pdf-gd-qty').innerText = entry.qty + " Cone";
    document.getElementById('pdf-gd-rate').innerText = "₹" + entry.rate;
    document.getElementById('pdf-gd-amount').innerText = "₹" + (entry.amount || 0).toLocaleString('en-IN');

    let elem = document.getElementById('pdf-gd-challan-template');
    let opt = { margin: 0.4, filename: `Challan_${entry.item}_${entry.qty}Cone.pdf`, image: { type: 'jpeg', quality: 1 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } }; 
    
    try {
        alert("Preparing Challan PDF... Please wait.");
        let pdfBlob = await html2pdf().set(opt).from(elem).output('blob'); 
        let file = new File([pdfBlob], opt.filename, { type: 'application/pdf' }); 
        if (navigator.canShare && navigator.canShare({ files: [file] })) { 
            await navigator.share({ files: [file], title: 'Transfer Challan', text: `Please find the transfer challan.` }); 
        } else { 
            html2pdf().set(opt).from(elem).save(); 
        } 
    } catch(e) { console.error(e); alert("Error generating PDF."); }
}

// ================= CASH & BANK BOOK LOGIC =================
let cbTransactions = [];
let cbBanks = [];
let totalCashBal = 0;
let totalBankBal = 0;
let currentCbTab = 'tx';
window.openingCash = 0;

onValue(ref(db, 'CashBankBook/OpeningCash'), (snapshot) => {
    window.openingCash = parseFloat(snapshot.val()) || 0;
    updateCbDashboard();
});

window.setOpeningCash = function() {
    let amt = prompt("गल्ले का शुरुआती बैलेंस (Opening Cash) दर्ज करें:", window.openingCash || 0);
    if(amt !== null && !isNaN(amt)) {
        set(ref(db, 'CashBankBook/OpeningCash'), parseFloat(amt)).then(() => {
            alert("Opening Cash Set Successfully!");
        });
    }
}

onValue(ref(db, 'CashBankBook/Banks'), (snapshot) => {
    let data = snapshot.val() || {};
    cbBanks = Object.keys(data).map(key => ({ key: key, ...data[key] }));
    updateCbDashboard();
    if(document.getElementById('cashbook-page') && document.getElementById('cashbook-page').classList.contains('active')) renderCbTab();
});

onValue(ref(db, 'CashBankBook/Transactions'), (snapshot) => {
    let data = snapshot.val() || {};
    cbTransactions = Object.keys(data).map(key => ({ key: key, ...data[key] })).reverse();
    updateCbDashboard();
    if(document.getElementById('cashbook-page') && document.getElementById('cashbook-page').classList.contains('active')) renderCbTab();
});

function updateCbDashboard() {
    totalBankBal = 0;
    cbBanks.forEach(b => totalBankBal += (parseFloat(b.balance) || 0));

    totalCashBal = window.openingCash || 0;
    cbTransactions.forEach(t => {
        if(t.mode === 'Cash') {
            if(t.type === 'IN') totalCashBal += parseFloat(t.amount);
            if(t.type === 'OUT') totalCashBal -= parseFloat(t.amount);
        }
    });
    
    if(document.getElementById('cb-cash-bal')) document.getElementById('cb-cash-bal').innerText = "₹ " + totalCashBal.toLocaleString('en-IN');
    if(document.getElementById('cb-bank-bal')) document.getElementById('cb-bank-bal').innerText = "₹ " + totalBankBal.toLocaleString('en-IN');
}

window.switchCbTab = function(tab) {
    currentCbTab = tab;
    document.getElementById('cb-tab-tx').classList.toggle('active', tab === 'tx');
    document.getElementById('cb-tab-banks').classList.toggle('active', tab === 'banks');
    renderCbTab();
}

window.renderCbTab = function() {
    let area = document.getElementById('cb-scroll-area');
    let html = "";
    if(currentCbTab === 'banks') {
        if(cbBanks.length === 0) {
            html = `<div style="text-align:center; padding:40px 20px; color:gray;">No bank accounts added yet.</div>`;
        } else {
            cbBanks.forEach(b => {
                html += `
                <div class="entry-card" style="padding:16px; border:1px solid var(--border); margin-bottom:12px; align-items:center; display:flex;">
                    <div style="width:40px; height:40px; background:#e8f0fe; color:var(--primary-dark); border-radius:50%; display:flex; justify-content:center; align-items:center; font-size:20px; margin-right:12px;" class="material-symbols-rounded">account_balance</div>
                    <div style="flex:1;">
                        <div style="font-weight:700; font-size:15px; color:var(--text-dark);">${b.name}</div>
                        <div style="font-size:11px; color:var(--text-muted);">Bank Account</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="color:var(--primary-dark); font-weight:800; font-size:16px;">₹${parseFloat(b.balance).toLocaleString('en-IN')}</div>
                        <button onclick="deleteCbBank('${b.key}')" style="background:transparent; border:none; color:var(--danger); font-size:12px; margin-top:4px; cursor:pointer;">Delete</button>
                    </div>
                </div>`;
            });
        }
    } else {
        if(cbTransactions.length === 0) {
            html = `<div style="text-align:center; padding:40px 20px; color:gray;">No transactions found.</div>`;
        } else {
            let sortedTx = [...cbTransactions].sort((a,b) => new Date(b.date) - new Date(a.date));
            sortedTx.forEach(t => {
                let d = new Date(t.date);
                let dateStr = isNaN(d) ? t.date : d.toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
                let color = t.type === 'IN' ? 'var(--success)' : 'var(--danger)';
                let sign = t.type === 'IN' ? '+' : '-';
                let icon = t.mode === 'Cash' ? 'payments' : 'account_balance';
                
                html += `
                <div class="entry-card" style="padding:14px; border:1px solid var(--border); margin-bottom:10px; align-items:center; display:flex;">
                    <div style="width:36px; height:36px; background:#f0f4f9; color:var(--text-muted); border-radius:50%; display:flex; justify-content:center; align-items:center; font-size:18px; margin-right:12px;" class="material-symbols-rounded">${icon}</div>
                    <div style="flex:1;">
                        <div style="font-weight:600; font-size:14px; color:var(--text-dark);">${t.details || 'Entry'}</div>
                        <div style="font-size:11px; color:var(--text-muted);">${dateStr} • ${t.mode}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="color:${color}; font-weight:700; font-size:15px;">${sign}₹${parseFloat(t.amount).toLocaleString('en-IN')}</div>
                        <button onclick="deleteCbTransaction('${t.key}', '${t.type}', ${t.amount}, '${t.modeKey}')" style="background:transparent; border:none; color:var(--danger); font-size:20px; margin-top:4px; cursor:pointer;" class="material-symbols-rounded">delete</button>
                    </div>
                </div>`;
            });
        }
    }
    area.innerHTML = html;
}

window.saveNewBank = function() {
    let name = document.getElementById('cb-new-bank-name').value.trim();
    let bal = parseFloat(document.getElementById('cb-new-bank-bal').value) || 0;
    if(!name) return alert("Please enter Bank Name!");
    
    push(ref(db, 'CashBankBook/Banks'), {
        name: name,
        balance: bal,
        createdAt: new Date().toISOString()
    }).then(() => {
        document.getElementById('cb-new-bank-name').value = '';
        document.getElementById('cb-new-bank-bal').value = '';
        document.getElementById('cb-bank-form').classList.add('form-hidden');
        switchCbTab('banks');
        alert("Bank Account Added!");
    });
}

window.deleteCbBank = function(key) {
    if(confirm("Are you sure you want to delete this Bank Account?")) {
        remove(ref(db, 'CashBankBook/Banks/' + key));
    }
}

window.openCbEntryModal = function(type) {
    document.getElementById('cb-entry-type').value = type;
    let title = document.getElementById('cb-entry-title');
    let btn = document.getElementById('cb-entry-save-btn');
    
    if(type === 'IN') {
        title.innerText = "Money IN (पैसे आये)";
        title.style.color = "var(--success)";
        btn.style.background = "var(--success)";
    } else {
        title.innerText = "Money OUT (पैसे गए)";
        title.style.color = "var(--danger)";
        btn.style.background = "var(--danger)";
    }

    document.getElementById('cb-entry-amount').value = '';
    document.getElementById('cb-entry-details').value = '';
    
    let modeSelect = document.getElementById('cb-entry-mode');
    let modeHtml = `<option value="Cash">Cash (गल्ला)</option>`;
    cbBanks.forEach(b => {
        modeHtml += `<option value="${b.key}">${b.name} (Bank)</option>`;
    });
    modeSelect.innerHTML = modeHtml;

    document.getElementById('cb-entry-modal').style.display = 'flex';
}

window.saveCbEntry = function() {
    let type = document.getElementById('cb-entry-type').value;
    let amount = parseFloat(document.getElementById('cb-entry-amount').value);
    let modeKey = document.getElementById('cb-entry-mode').value;
    let details = document.getElementById('cb-entry-details').value.trim();

    if(isNaN(amount) || amount <= 0) return alert("Please enter a valid amount!");
    if(!details) details = type === 'IN' ? 'Money Received' : 'Money Sent';

    let modeName = "Cash";
    
    if(modeKey !== 'Cash') {
        let bank = cbBanks.find(b => b.key === modeKey);
        if(bank) {
            modeName = bank.name;
            let newBal = type === 'IN' ? (bank.balance + amount) : (bank.balance - amount);
            update(ref(db, 'CashBankBook/Banks/' + bank.key), { balance: newBal });
        }
    }

    push(ref(db, 'CashBankBook/Transactions'), {
        date: new Date().toISOString(),
        type: type,
        amount: amount,
        mode: modeName,
        modeKey: modeKey,
        details: details
    }).then(() => {
        document.getElementById('cb-entry-modal').style.display = 'none';
        switchCbTab('tx');
    });
}

window.deleteCbTransaction = function(txKey, type, amount, modeKey) {
    if(!confirm("Are you sure you want to delete this transaction?")) return;
    
    if(modeKey && modeKey !== 'Cash') {
        let bank = cbBanks.find(b => b.key === modeKey);
        if(bank) {
            let newBal = type === 'IN' ? (bank.balance - amount) : (bank.balance + amount);
            update(ref(db, 'CashBankBook/Banks/' + bank.key), { balance: newBal });
        }
    }
    remove(ref(db, 'CashBankBook/Transactions/' + txKey));
}
