const SUPABASE_URL = 'https://jvuibcqogyyffylvfeog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2dWliY3FvZ3l5ZmZ5bHZmZW9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYzMjg3MzUsImV4cCI6MjA1MTkwNDczNX0.iIu6f3LwdLmHoHmuVjbuVm-uLCDWA3oGZ7J07wXGBBU';
// Only create supabase client if it doesn't already exist (prevents duplicate declaration error)
if (typeof window.supabaseClient === 'undefined') {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
// Use var to allow redeclaration if script runs multiple times
var supabase = window.supabaseClient;

// Helper function to get base path (repository name) for GitHub Pages
// Returns '/gf-sports' on GitHub Pages or '' for local development
function getBasePath() {
    const pathname = window.location.pathname;
    // Extract repo name from path like /gf-sports/jersey-configurator/index.html
    const pathParts = pathname.split('/').filter(part => part);
    
    // If we're on GitHub Pages, the first part is usually the repo name
    // Check if we're on github.io domain
    if (window.location.hostname.includes('github.io')) {
        // On GitHub Pages, first path segment is the repo name
        if (pathParts.length > 0) {
            return `/${pathParts[0]}`;
        }
    }
    
    // For local development or if no repo name found, return empty string
    return '';
}

// Function to get the current language
function getCurrentLanguage() {
  return localStorage.getItem("language") || "en"
}

// Cached auth state to prevent repeated Supabase calls
let cachedAuthState = {
  user: null,        // cached user object (null = not checked yet or not logged in)
  isLoggedIn: null,  // null = not checked yet, true/false = cached value
  isChecking: false, // flag to prevent concurrent checks
  accountStatus: null,   // pending, approved, suspended
  jerseyAccess: null,    // boolean or null (not checked)
  socksAccess: null      // boolean or null (not checked)
};

// Check if user logged in (uses cached value if available)
async function checkUserLoggedIn() {
  // Return cached value if available
  if (cachedAuthState.isLoggedIn !== null) {
    return cachedAuthState.isLoggedIn;
  }
  
  // Prevent concurrent checks
  if (cachedAuthState.isChecking) {
    // Wait for ongoing check to complete
    while (cachedAuthState.isChecking) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return cachedAuthState.isLoggedIn;
  }
  
  // Perform the check
  cachedAuthState.isChecking = true;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    cachedAuthState.user = user;
    cachedAuthState.isLoggedIn = user !== null && !error;
    return cachedAuthState.isLoggedIn;
  } catch (error) {
    cachedAuthState.user = null;
    cachedAuthState.isLoggedIn = false;
    return false;
  } finally {
    cachedAuthState.isChecking = false;
  }
}

// Get user (uses cached value if available, otherwise fetches)
async function getCachedAuthUser() {
  // If we have a cached value, return it
  if (cachedAuthState.isLoggedIn !== null) {
    return cachedAuthState.user;
  }
  
  // Otherwise, check and cache
  await checkUserLoggedIn();
  return cachedAuthState.user;
}

// Function to invalidate auth cache (call after login/logout)
function invalidateAuthCache() {
  cachedAuthState.user = null;
  cachedAuthState.isLoggedIn = null;
  cachedAuthState.isChecking = false;
  cachedAuthState.accountStatus = null;
  cachedAuthState.jerseyAccess = null;
  cachedAuthState.socksAccess = null;
}

// Get account status from profiles table
async function getAccountStatus() {
  // Return cached value if available
  if (cachedAuthState.accountStatus !== null) {
    return cachedAuthState.accountStatus;
  }
  
  const user = await getCachedAuthUser();
  if (!user) return 'pending';
  
  const { data, error } = await supabase
    .from('profiles')
    .select('account_status')
    .eq('user_id', user.id)
    .single();
  
  if (error || !data) {
    console.error('Error fetching account status:', error);
    return 'pending';
  }
  
  cachedAuthState.accountStatus = data.account_status || 'pending';
  return cachedAuthState.accountStatus;
}

// Get configurator access (jersey_access, socks_access)
async function getConfiguratorAccess() {
  // Return cached values if available
  if (cachedAuthState.jerseyAccess !== null && cachedAuthState.socksAccess !== null) {
    return {
      jersey_access: cachedAuthState.jerseyAccess,
      socks_access: cachedAuthState.socksAccess
    };
  }
  
  const user = await getCachedAuthUser();
  if (!user) {
    return { jersey_access: false, socks_access: false };
  }
  
  const { data, error } = await supabase
    .from('profiles')
    .select('account_status, jersey_access, socks_access')
    .eq('user_id', user.id)
    .single();
  
  if (error || !data) {
    console.error('Error fetching configurator access:', error);
    return { jersey_access: false, socks_access: false };
  }
  
  // Cache all values
  cachedAuthState.accountStatus = data.account_status || 'pending';
  cachedAuthState.jerseyAccess = data.jersey_access || false;
  cachedAuthState.socksAccess = data.socks_access || false;
  
  return {
    jersey_access: cachedAuthState.jerseyAccess,
    socks_access: cachedAuthState.socksAccess
  };
}

// Check if user can access a specific configurator
async function canAccessConfigurator(type) {
  const isLoggedIn = await checkUserLoggedIn();
  if (!isLoggedIn) return false;
  
  const status = await getAccountStatus();
  if (status !== 'approved') return false;
  
  const access = await getConfiguratorAccess();
  return type === 'jersey' ? access.jersey_access : access.socks_access;
}

// Handle create account form submission
const createAccountForm = document.querySelector('.create-account-form');
const phoneNumberInput = document.getElementById('phoneNumber');

// Function to validate phone number
function validatePhoneNumber(phoneNumber) {
  return /^[\d()+\-]{7,15}$/.test(phoneNumber);
}

// Add event listener to phone number input
if (phoneNumberInput) {
  phoneNumberInput.addEventListener('input', function (e) {
    let input = e.target.value;

    // Remove any characters that are not digits, +, -, (, or )
    input = input.replace(/[^\d()+\-]/g, '');

    // Truncate to 15 characters if longer
    input = input.slice(0, 15);

    // Update the input value
    e.target.value = input;

    // Visual feedback for minimum length
    if (input.length < 7) {
      e.target.setCustomValidity('Phone number must be at least 7 characters long');
    } else {
      e.target.setCustomValidity('');
    }
  });
}

// Allow only letters (and space, hyphen, apostrophe for names) in first/last name
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');

function allowAlphabetsOnly(e) {
  let input = e.target.value;
  // Keep only A-Z, a-z, space, hyphen, apostrophe
  input = input.replace(/[^A-Za-z\s\-']/g, '');
  e.target.value = input;
}

if (firstNameInput) {
  firstNameInput.addEventListener('input', allowAlphabetsOnly);
}
if (lastNameInput) {
  lastNameInput.addEventListener('input', allowAlphabetsOnly);
}

if (createAccountForm) {
  createAccountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const phoneNumber = phoneNumberInput.value;
    const clubNameEl = document.getElementById('clubNameSignup') || document.getElementById('clubName');
    const clubName = clubNameEl ? clubNameEl.value : '';
    const distributorNameEl = document.getElementById('distributorNameSignup');
    const distributorName = distributorNameEl ? distributorNameEl.value.trim() : '';
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;

    // Ensure phone number is valid
    if (!validatePhoneNumber(phoneNumber)) {
      window.translatedAlert('invalid_phone_number', 'Phone number must be 7-15 characters long and contain only numbers, +, -, (, and )');
      return;
    }

    if (!distributorName) {
      window.translatedAlert('distributor_name_required', 'Distributor name is required.');
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            phone_number: phoneNumber,
            club_name: clubName,
            distributor_name: distributorName
          }
        }
      });

      if (error) throw error;

      console.log('Sign up successful:', data);
      window.translatedAlert('signup_successful_check_email');
      closeAllModals();
    } catch (error) {
      console.error('Error during sign up:', error);
      window.translatedAlert('signup_failed', error ? error.message : 'An unknown error occurred');
    }
  });
}

// Handle login form submission
const loginForm = document.querySelector('.login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) throw error;

      console.log('Login successful:', data.user);
      invalidateAuthCache(); // Invalidate cache after login
      closeAllModals();
      await updateUIBasedOnLoginStatus();
      window.location.reload();
    } catch (error) {
      console.error('Login error:', error.message);
      window.translatedAlert('login_failed', error.message);
    }
  });
}

// User dropdown functionality
const userButton = document.querySelector('.user-button');
const userDropdown = document.querySelector('.user-dropdown');
const loginModal = document.getElementById('login-modal');
const createAccountModal = document.getElementById('create-account-modal');
const loginBtn = document.getElementById('login-btn');
const createAccountBtn = document.getElementById('create-account-btn');
const forgotPasswordModal = document.getElementById('forgot-password-modal');
const forgotPasswordForm = document.querySelector('.forgot-password-form');
const forgotPasswordStage1 = document.getElementById('forgot-password-stage-1');
const forgotPasswordStage2 = document.getElementById('forgot-password-stage-2');
const backToLoginBtn = document.getElementById('backToLoginBtn');
const backToLoginLink = document.getElementById('backToLoginLink');

// Function to position dropdown relative to user button
function positionDropdown() {
  if (userButton && userDropdown) {
    const buttonRect = userButton.getBoundingClientRect();
    const dropdownWidth = 200; // Width of dropdown from CSS

    // Calculate desired position (150px to the right of button's right edge)
    let rightOffset = window.innerWidth - buttonRect.right - 150;

    // Ensure dropdown doesn't go off the right edge of the viewport
    // Minimum right offset should be 8px from the edge
    const minRightOffset = 8;
    rightOffset = Math.max(rightOffset, minRightOffset);

    // Position dropdown just below the button
    userDropdown.style.top = `${buttonRect.bottom + 8}px`; // 8px gap below button
    userDropdown.style.right = `${rightOffset}px`;
  }
}

// Toggle dropdown when clicking user button
if (userButton && userDropdown) {
  userButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = userDropdown.style.display === 'block';
    if (!isVisible) {
      positionDropdown(); // Update position before showing
      userDropdown.style.display = 'block';
    } else {
      userDropdown.style.display = 'none';
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!userButton.contains(e.target) && !userDropdown.contains(e.target)) {
      userDropdown.style.display = 'none';
    }
  });

  // Reposition dropdown on window resize
  window.addEventListener('resize', () => {
    if (userDropdown.style.display === 'block') {
      positionDropdown();
    }
  });
}

// Modal handling functions
function closeAllModals() {
  if (loginModal) loginModal.style.display = 'none';
  if (createAccountModal) createAccountModal.style.display = 'none';
  if (forgotPasswordModal) forgotPasswordModal.style.display = 'none';
}

function showLoginModal() {
  closeAllModals();
  if (loginModal) loginModal.style.display = 'flex';
}

function showCreateAccountModal() {
  closeAllModals();
  if (createAccountModal) createAccountModal.style.display = 'flex';
}

// Show login modal when clicking login button
if (loginBtn) {
  loginBtn.addEventListener('click', () => {
    if (userDropdown) userDropdown.style.display = 'none';
    showLoginModal();
  });
}

// Show create account modal when clicking create account button
if (createAccountBtn) {
  createAccountBtn.addEventListener('click', () => {
    if (userDropdown) userDropdown.style.display = 'none';
    showCreateAccountModal();
  });
}

// Switch between modals
const switchToLogin = document.getElementById('switch-to-login');
if (switchToLogin) {
  switchToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    showLoginModal();
  });
}

const loginFormFooterLinks = document.querySelectorAll('.login-form .form-footer a');
if (loginFormFooterLinks.length > 0) {
  loginFormFooterLinks[0].addEventListener('click', (e) => {
    e.preventDefault();
    showCreateAccountModal();
  });

  if (loginFormFooterLinks.length > 1) {
    loginFormFooterLinks[1].addEventListener('click', (e) => {
      e.preventDefault();
      showForgotPasswordModal();
    });
  }
}

// Close modals when clicking outside
if (loginModal) {
  loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) {
      closeAllModals();
    }
  });
}

if (createAccountModal) {
  createAccountModal.addEventListener('click', (e) => {
    if (e.target === createAccountModal) {
      closeAllModals();
    }
  });
}

function showForgotPasswordModal() {
  closeAllModals();
  if (forgotPasswordModal) {
    forgotPasswordModal.style.display = 'flex';
    if (forgotPasswordStage1) forgotPasswordStage1.style.display = 'block';
    if (forgotPasswordStage2) forgotPasswordStage2.style.display = 'none';
    if (backToLoginBtn) backToLoginBtn.style.display = 'none';
  }
}

// Handle forgot password form submission
if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgotPasswordEmail').value;

    try {
      const basePath = getBasePath();
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + basePath + '/reset-password/'
      });

      if (error) throw error;

      console.log('Password reset email sent:', email);

      // Show the second stage
      if (forgotPasswordStage1) forgotPasswordStage1.style.display = 'none';
      if (forgotPasswordStage2) forgotPasswordStage2.style.display = 'block';
    } catch (error) {
      console.error('Password reset error:', error.message);
      window.translatedAlert('password_reset_failed', error.message);
    }
  });
}

// Handle "Back to Login" button click
if (backToLoginBtn) {
  backToLoginBtn.addEventListener('click', () => {
    closeAllModals();
    showLoginModal();
  });
}

// Handle "Back to Login" link click
if (backToLoginLink) {
  backToLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    closeAllModals();
    showLoginModal();
  });
}

// Close forgot password modal when clicking outside
if (forgotPasswordModal) {
  forgotPasswordModal.addEventListener('click', (e) => {
    if (e.target === forgotPasswordModal) {
      closeAllModals();
    }
  });

  // Prevent closing when clicking inside the modal content
  const modalContent = forgotPasswordModal.querySelector('.modal-content');
  if (modalContent) {
    modalContent.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
}

// Add this function to handle dynamic translations
function getTranslation(key, lang) {
  const translations = {
    logout: {
      en: "Log out",
      fr: "Déconnexion",
    }
  }
  return translations[key]?.[lang] || key
}

// Update UI based on login
async function updateUIBasedOnLoginStatus() {
  const isLoggedIn = await checkUserLoggedIn()
  const currentLang = localStorage.getItem("language") || "en"

  // 1. Show/hide .nav-link (always show home button, only show My Designs/Place Order when logged in)
  const navLinks = document.querySelectorAll(".nav-link")
  navLinks.forEach((link) => {
    // Always show home button
    if (link.classList.contains('home-button')) {
      link.style.display = "flex"
      return
    }
    // Only show "My Designs" and "Place Order" when logged in
    if (link.textContent.includes('My Designs') || link.textContent.includes('Mes Designs') ||
      link.textContent.includes('Place Order') || link.textContent.includes('Passer Commande')) {
      link.style.display = isLoggedIn ? "flex" : "none"
    }
  })

  // Ensure home button is always visible (even if not a nav-link)
  const homeButton = document.querySelector(".home-button")
  if (homeButton) {
    homeButton.style.display = "flex"
  }

  // 2. Change color of .user-button SVG
  const userButton = document.querySelector(".user-button")
  if (userButton) {
    const svg = userButton.querySelector('svg')
    if (svg) {
      svg.style.color = isLoggedIn ? "green" : ""
    }
  }

  // 3. Hide/show create-account-btn
  const createAccountBtn = document.getElementById("create-account-btn")
  if (createAccountBtn) {
    createAccountBtn.style.display = isLoggedIn ? "none" : "flex"
  }

  // 4. Update user-dropdown
  const userDropdown = document.querySelector(".user-dropdown")
  const loginBtn = document.getElementById("login-btn")
  let logoutBtn = document.getElementById("logout-btn")

  if (isLoggedIn) {
    if (loginBtn) loginBtn.style.display = "none"
    if (!logoutBtn && userDropdown) {
      logoutBtn = document.createElement("button")
      logoutBtn.id = "logout-btn"
      logoutBtn.className = "dropdown-item"
      logoutBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span data-en>Log out</span>
          <span data-fr>Déconnexion</span>
        `
      userDropdown.appendChild(logoutBtn)
    }
    if (logoutBtn) logoutBtn.style.display = "flex"
  } else {
    if (loginBtn) loginBtn.style.display = "flex"
    if (logoutBtn) {
      logoutBtn.style.display = "none"
    }
  }
}

// this to ensure the logout button text is updated when the language changes
// Note: This function is no longer needed as CSS handles visibility via data-en/data-fr attributes
function updateLogoutButtonText() {
  // The language system uses CSS to show/hide spans with data-en and data-fr attributes
  // No manual text update needed
}

// Call this function on page load and after login/logout
window.addEventListener('DOMContentLoaded', updateUIBasedOnLoginStatus);

// Add logout functionality
document.addEventListener('click', async (e) => {
  // Check if the clicked element or any of its parents have the id 'logout-btn'
  const logoutButton = e.target.closest('#logout-btn');

  if (logoutButton) {
    // Warn about unsaved changes
    if (window.designDirty) {
      const proceed = await window.showUnsavedConfirm
        ? await window.showUnsavedConfirm()
        : confirm('You have unsaved changes. Leave anyway?');
      if (!proceed) return;
    }

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      console.log('Logged out successfully');
      invalidateAuthCache(); // Invalidate cache after logout
      await updateUIBasedOnLoginStatus();
      // Stay on the current page (jersey-configurator/index.html)
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error.message);
      window.translatedAlert('logout_failed', error.message);
    }
  }
});

// Console messages translations
const alertMessages = {
  'signup_successful': {
    'en': 'Sign up successful! You are now logged in.',
    'fr': 'Inscription réussie ! Vous êtes maintenant connecté.'
  },
  'signup_successful_check_email': {
    'en': 'Sign up successful! Please check your email to confirm your account before signing in.',
    'fr': 'Inscription réussie ! Veuillez vérifier votre e-mail pour confirmer votre compte avant de vous connecter.'
  },
  'signup_failed': {
    'en': 'Sign up failed:',
    'fr': 'Échec de l\'inscription :'
  },
  'login_failed': {
    'en': 'Login failed:',
    'fr': 'Échec de la connexion :'
  },
  'password_reset_failed': {
    'en': 'Password reset failed:',
    'fr': 'Échec de la réinitialisation du mot de passe :'
  },
  'logout_failed': {
    'en': 'Logout failed:',
    'fr': 'Échec de la déconnexion :'
  },
  'unsaved_changes_warning': {
    'en': 'You have unsaved changes. Save before leaving?',
    'fr': 'Vous avez des modifications non enregistrées. Enregistrez avant de quitter ?'
  },
  'unsaved_stay': {
    'en': 'Stay',
    'fr': 'Rester'
  },
  'unsaved_leave': {
    'en': 'Leave',
    'fr': 'Quitter'
  },
  'invalid_phone_number': {
    'en': 'Invalid phone number',
    'fr': 'Numéro de téléphone invalide'
  },
  'distributor_name_required': {
    'en': 'Distributor name is required.',
    'fr': 'Le nom du distributeur est obligatoire.'
  },
  'no_user_logged_in': {
    'en': 'Please log in to upload a logo',
    'fr': 'Veuillez vous connecter pour télécharger un logo'
  },
  'uploading_logo': {
    'en': 'Uploading logo...',
    'fr': 'Téléchargement du logo...'
  },
  'logo_upload_success': {
    'en': 'Logo uploaded successfully',
    'fr': 'Logo téléchargé avec succès'
  },
  'logo_upload_error': {
    'en': 'Error uploading logo',
    'fr': 'Erreur lors du téléchargement du logo'
  },
  'error_uploading_logo': {
    'en': 'Error uploading logo',
    'fr': 'Erreur lors du téléchargement du logo'
  },
  'unique_name_error': {
    'en': 'A design with this name already exists',
    'fr': 'Un design avec ce nom existe déjà'
  },
  'error_sharing_design': {
    'en': 'Error sharing design',
    'fr': 'Erreur lors du partage du design'
  },
  'unable_to_share_missing_data': {
    'en': 'Unable to share: missing design data',
    'fr': 'Impossible de partager : données de design manquantes'
  },
  'share_url_copied': {
    'en': 'Share URL copied to clipboard!',
    'fr': 'URL de partage copiée dans le presse-papiers !'
  },
  'failed_to_copy_share_url': {
    'en': 'Failed to copy share URL',
    'fr': 'Échec de la copie de l\'URL de partage'
  },
  'design_ordered_no_delete': {
    'en': 'This design has been ordered and cannot be deleted. However, you can create a duplicate and redesign by using the \'Save As\' option in the Configurator page.',
    'fr': 'Cette conception a été commandée et ne peut pas être supprimée. Cependant, vous pouvez créer un duplicata et le modifier en utilisant l\'option \'Enregistrer sous\' dans la page du Configurateur.'
  },
  'design_ordered_no_rename': {
    'en': 'This design has been ordered and cannot be renamed. However, you can create a duplicate by using the \'Save As\' option in the Configurator page.',
    'fr': 'Cette conception a été commandée et ne peut pas être renommée. Cependant, vous pouvez créer un duplicata en utilisant l\'option \'Enregistrer sous\' dans la page du Configurateur.'
  },
  'error_deleting_design': {
    'en': 'Error deleting design',
    'fr': 'Erreur lors de la suppression du design'
  },
  'delete_confirmation': {
    'en': 'Are you sure you want to delete "{0}"? This action cannot be undone.',
    'fr': 'Êtes-vous sûr de vouloir supprimer "{0}" ? Cette action ne peut pas être annulée.'
  },
  'created_on': {
    'en': 'Created on',
    'fr': 'Créé le'
  },
  'select': {
    'en': 'Select',
    'fr': 'Sélectionner'
  },
  'all_sizes_added': {
    'en': 'All available sizes have been added',
    'fr': 'Toutes les tailles disponibles ont été ajoutées'
  },
  'form_errors': {
    'en': 'Please fix all form errors before submitting',
    'fr': 'Veuillez corriger toutes les erreurs du formulaire avant de soumettre'
  },
  'minimum_quantity_error': {
    'en': 'Total quantity must be greater than 0',
    'fr': 'La quantité totale doit être supérieure à 0'
  },
  'no_designs_in_order': {
    'en': 'Please add at least one design to place an order',
    'fr': 'Veuillez ajouter au moins un design pour passer une commande'
  },
  'order_placed_success': {
    'en': 'Order placed successfully!',
    'fr': 'Commande passée avec succès !'
  },
  'order_placement_error': {
    'en': 'Error placing order. Please try again.',
    'fr': 'Erreur lors de la commande. Veuillez réessayer.'
  },
  'design_already_placed_error': {
    'en': 'This design has already been ordered and cannot be modified. However, you can create a duplicate by using the \'Save As\' option in the Configurator page.',
    'fr': 'Ce modèle a déjà été commandé et ne peut être modifié. Cependant, vous pouvez créer un doublon en utilisant l\'option \'Enregistrer sous\' dans la page Configurateur.'
  },
  'login_required_configurator': {
    'en': 'Please log in to access the configurator.',
    'fr': 'Veuillez vous connecter pour accéder au configurateur.'
  },
  'account_pending_title': {
    'en': 'Account Pending Approval',
    'fr': 'Compte en attente d\'approbation'
  },
  'account_pending_message': {
    'en': 'Your account is being reviewed. You\'ll receive an email when approved.',
    'fr': 'Votre compte est en cours de vérification. Vous recevrez un e-mail une fois approuvé.'
  },
  'account_suspended_title': {
    'en': 'Account Suspended',
    'fr': 'Compte suspendu'
  },
  'account_suspended_message': {
    'en': 'Your account has been suspended. Contact support if this is an error.',
    'fr': 'Votre compte a été suspendu. Contactez le support si c\'est une erreur.'
  },
  'no_configurator_access_title': {
    'en': 'Access Not Granted',
    'fr': 'Accès non accordé'
  },
  'no_configurator_access_message': {
    'en': 'You do not have access to this configurator. Please contact the administrator if you believe this is an error.',
    'fr': 'Vous n\'avez pas accès à ce configurateur. Veuillez contacter l\'administrateur si vous pensez qu\'il s\'agit d\'une erreur.'
  },
  'login_required_title': {
    'en': 'Login Required',
    'fr': 'Connexion requise'
  },
  'login_required_message': {
    'en': 'Please log in to access the configurator.',
    'fr': 'Veuillez vous connecter pour accéder au configurateur.'
  }
}

// Function to show translated alert
function showTranslatedAlert(messageKey, ...args) {
  const currentLang = getCurrentLanguage()
  const message = alertMessages[messageKey] ? alertMessages[messageKey][currentLang] || messageKey : messageKey
  const fullMessage = message + " " + args.join(" ")

  // Remove any existing alert modal
  const existingModal = document.querySelector('.modal-overlay-alert');
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay-alert';

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content-alert';

  // Create message element
  const messageElement = document.createElement('p');
  messageElement.className = 'modal-message-alert';
  messageElement.textContent = fullMessage;

  // Create button
  const button = document.createElement('button');
  button.className = 'modal-button-alert';
  button.textContent = 'OK';
  button.addEventListener('click', () => {
    overlay.remove();
  });

  // Assemble modal
  modalContent.appendChild(messageElement);
  modalContent.appendChild(button);
  overlay.appendChild(modalContent);

  // Add to body
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

// Function to show translated confirmation (returns Promise<boolean>)
function showTranslatedConfirm(message) {
  return new Promise((resolve) => {
    // Remove any existing confirmation modal
    const existingModal = document.querySelector('.modal-overlay-confirm');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-confirm';

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content-confirm';

    // Create message element
    const messageElement = document.createElement('p');
    messageElement.className = 'modal-message-confirm';
    messageElement.textContent = message;

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-buttons-confirm';

    // Create Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.className = 'modal-button-confirm modal-button-secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    // Create Confirm button
    const confirmButton = document.createElement('button');
    confirmButton.className = 'modal-button-confirm modal-button-primary';
    confirmButton.textContent = 'Delete';
    confirmButton.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    // Assemble modal
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    modalContent.appendChild(messageElement);
    modalContent.appendChild(buttonContainer);
    overlay.appendChild(modalContent);

    // Add to body
    document.body.appendChild(overlay);

    // Close on overlay click (resolve as false)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

// Unsaved changes confirmation (translated buttons)
function showUnsavedConfirm(messageKey = 'unsaved_changes_warning') {
  const lang = getCurrentLanguage();
  const message = alertMessages[messageKey] ? alertMessages[messageKey][lang] || messageKey : messageKey;
  const stayLabel = alertMessages['unsaved_stay'] ? alertMessages['unsaved_stay'][lang] || 'Stay' : 'Stay';
  const leaveLabel = alertMessages['unsaved_leave'] ? alertMessages['unsaved_leave'][lang] || 'Leave' : 'Leave';

  return new Promise((resolve) => {
    const existingModal = document.querySelector('.modal-overlay-confirm');
    if (existingModal) {
      existingModal.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-confirm';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content-confirm';

    const messageElement = document.createElement('p');
    messageElement.className = 'modal-message-confirm';
    messageElement.textContent = message;

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-buttons-confirm';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'modal-button-confirm modal-button-secondary';
    cancelButton.textContent = stayLabel;
    cancelButton.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    const confirmButton = document.createElement('button');
    confirmButton.className = 'modal-button-confirm modal-button-primary';
    confirmButton.textContent = leaveLabel;
    confirmButton.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    modalContent.appendChild(messageElement);
    modalContent.appendChild(buttonContainer);
    overlay.appendChild(modalContent);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

// Make confirmation function available globally
window.translatedConfirm = showTranslatedConfirm;
window.showUnsavedConfirm = showUnsavedConfirm;

// Global translated alert method
window.translatedAlert = showTranslatedAlert

// Make checkUserLoggedIn, getCachedAuthUser, and invalidateAuthCache available globally
window.checkUserLoggedIn = checkUserLoggedIn;
window.getCachedAuthUser = getCachedAuthUser;
window.invalidateAuthCache = invalidateAuthCache;
window.showLoginModal = showLoginModal;

// Make account status and configurator access functions available globally
window.getAccountStatus = getAccountStatus;
window.getConfiguratorAccess = getConfiguratorAccess;
window.canAccessConfigurator = canAccessConfigurator;

// Loading animation functions
function showLoading() {
  const loadingAnimation = document.getElementById('loading-animation');
  if (loadingAnimation) {
    loadingAnimation.style.display = 'block';
  }
}

function hideLoading() {
  const loadingAnimation = document.getElementById('loading-animation');
  if (loadingAnimation) {
    loadingAnimation.style.display = 'none';
  }
}

// Make loading functions available globally
window.showLoading = showLoading;
window.hideLoading = hideLoading;

// Helper function to get translation
function getTranslation(key, lang) {
  return alertMessages[key] ? (alertMessages[key][lang] || alertMessages[key]['en']) : key;
}

// Make getTranslation available globally
window.getTranslation = getTranslation;

// Make getCurrentLanguage available globally
window.getCurrentLanguage = getCurrentLanguage;

// Make alertMessages available globally (for updateUploadStatus to use)
window.alertMessages = alertMessages;

// Language toggle functionality - script.js handles the main logic
// This file just ensures language is initialized if script.js hasn't loaded yet
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for script.js to initialize (script.js loads after auth.js)
  setTimeout(() => {
    const toggle = document.querySelector('.toggle-switch');
    
    // Only add event listener if script.js hasn't already set it up
    if (toggle && !toggle.hasAttribute('data-listener-attached')) {
      // Fallback: if script.js didn't run, set up the toggle here
      toggle.setAttribute('data-listener-attached', 'true');
      
      // Create a fallback setLanguage if script.js didn't define it
      if (typeof window.setLanguage === 'undefined') {
        window.setLanguage = function(lang) {
          const root = document.documentElement;
          const isFrench = lang === 'fr';
          
          // Remove existing lang class and add the correct one
          root.classList.remove('lang-fr');
          if (isFrench) {
            root.classList.add('lang-fr');
          }
          root.lang = lang;
          
          const toggle = document.querySelector('.toggle-switch');
          if (toggle) {
            toggle.setAttribute('aria-pressed', isFrench ? 'true' : 'false');
          }
          
          localStorage.setItem('language', lang);
        };
      }
      
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentLang = localStorage.getItem('language') || 'en';
        const nextLang = currentLang === 'en' ? 'fr' : 'en';
        if (typeof window.setLanguage === 'function') {
          window.setLanguage(nextLang);
        }
      });
      
      // Initialize language
      if (typeof window.setLanguage === 'function') {
        const savedLang = localStorage.getItem('language') || 'en';
        window.setLanguage(savedLang);
      }
    }
  }, 50);
});


