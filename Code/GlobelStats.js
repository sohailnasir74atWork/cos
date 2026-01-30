import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getApp, getApps, initializeApp } from '@react-native-firebase/app';
import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';
import { ref, set, update, get, onDisconnect, getDatabase, onValue, remove, query, orderByValue, equalTo } from '@react-native-firebase/database';
import { getFirestore, doc, onSnapshot } from '@react-native-firebase/firestore';
import { createNewUser, registerForNotifications } from './Globelhelper';
import { useLocalState } from './LocalGlobelStats';
import { requestPermission } from './Helper/PermissionCheck';
import { useColorScheme, AppState } from 'react-native';
import { getFlag } from './Helper/CountryCheck';



const app = getApps().length ? getApp() : null;
const auth = getAuth(app);
const firestoreDB = getFirestore(app);
const appdatabase = getDatabase(app, 'https://creature-1e5ce-default-rtdb.firebaseio.com/');
const GlobalStateContext = createContext();



// Custom hook to access global state
export const useGlobalState = () => useContext(GlobalStateContext);

export const GlobalStateProvider = ({ children }) => {
  const { localState, updateLocalState } = useLocalState()

  const colorScheme = useColorScheme(); // 'light' or 'dark'
  const [theme, setTheme] = useState(colorScheme);

  // Track system theme changes strictly
  useEffect(() => {
    setTheme(colorScheme);
  }, [colorScheme]);
  const [api, setApi] = useState(null);
  const [freeTranslation, setFreeTranslation] = useState(null);
  const [currentUserEmail, setCurrentuserEmail] = useState('')
  const [single_offer_wall, setSingle_offer_wall] = useState(false)
  const [tradingServerLink, setTradingServerLink] = useState(null); // Trading server link from admin servers



  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState({
    id: null,
    // selectedFruits: [],
    // isReminderEnabled: false,
    // isSelectedReminderEnabled: false,
    displayName: '',
    avatar: null,
    // rewardPoints: 0,
    isBlock: false,
    fcmToken: null,
    lastActivity: null,
    online: false,
    isPro: false,
    createdAt: null


  });

  const [loading, setLoading] = useState(false);
  // const [robloxUsername, setRobloxUsername] = useState('');
  const robloxUsernameRef = useRef('');


  // Track system theme changes strictly
  useEffect(() => {
    setTheme(colorScheme);
  }, [colorScheme]);

  // const isAdmin = user?.id  ? user?.id == '3CAAolfaX3UE3BLTZ7ghFbNnY513' : false

  // ✅ Store updateLocalState in ref to avoid dependency issues
  const updateLocalStateRef = useRef(updateLocalState);
  useEffect(() => {
    updateLocalStateRef.current = updateLocalState;
  }, [updateLocalState]);

  // ✅ Memoize updateLocalStateAndDatabase to prevent infinite loops and duplicate writes
  const updateLocalStateAndDatabase = useCallback(async (keyOrUpdates, value) => {
    try {
      let updates = {};

      if (typeof keyOrUpdates === 'string') {
        updates = { [keyOrUpdates]: value };
        await updateLocalStateRef.current(keyOrUpdates, value); // ✅ Use ref to avoid dependency
      } else if (typeof keyOrUpdates === 'object') {
        updates = keyOrUpdates;
        for (const [key, val] of Object.entries(updates)) {
          await updateLocalStateRef.current(key, val); // ✅ Use ref to avoid dependency
        }
      } else {
        throw new Error('Invalid arguments for update.');
      }

      // ✅ Update in-memory user state and Firebase in one functional update (prevents duplicate writes)
      setUser((prev) => {
        // ✅ Check if updates are actually different to prevent duplicate writes
        const hasChanges = Object.keys(updates).some(key => prev[key] !== updates[key]);
        if (!hasChanges && prev?.id) {
          // No changes, skip Firebase write
          return prev;
        }

        const updatedUser = { ...prev, ...updates };

        // ✅ Update Firebase only if user is logged in and there are actual changes
        // ✅ Exclude 'online' field from user data (it's stored in presence/{uid} node)
        if (prev?.id && appdatabase && hasChanges) {
          const userRef = ref(appdatabase, `users/${prev.id}`);
          const userDataUpdates = { ...updates };
          delete userDataUpdates.online; // ✅ Don't sync online to user data
          update(userRef, userDataUpdates).catch((error) => {
            // Silently handle Firebase errors
          });
        }

        return updatedUser;
      });
    } catch (error) {
      // console.error('❌ Error updating user state or database:', error);
    }
  }, [appdatabase]); // ✅ Removed updateLocalState from deps, using ref instead



  // ✅ Use ref to track if flag has been set for current user (prevents infinite loop)
  const flagSetForUserRef = useRef(null);
  const updateLocalStateAndDatabaseRef = useRef(updateLocalStateAndDatabase);

  // ✅ Keep ref updated with latest function
  useEffect(() => {
    updateLocalStateAndDatabaseRef.current = updateLocalStateAndDatabase;
  }, [updateLocalStateAndDatabase]);

  // ✅ Handle flag setting based on user preference (saves Firebase data costs)
  useEffect(() => {
    if (!isAdmin && user?.id && appdatabase) {
      // ✅ Only set flag once per user.id to prevent infinite loop
      if (flagSetForUserRef.current !== user.id) {
        flagSetForUserRef.current = user.id;

        // ✅ Only store flag if user wants to show it (saves Firebase data costs)
        if (localState?.showFlag !== false) {
          // User wants to show flag - store it
          updateLocalStateAndDatabaseRef.current({ flage: getFlag() });
        }
        // If showFlag is false, don't store flag (saves data)
      } else {
        // ✅ Handle flag toggle changes after initial setup
        if (localState?.showFlag === false && user?.flage) {
          // ✅ User toggled flag off - remove it from Firebase to save data
          const userRef = ref(appdatabase, `users/${user.id}`);
          update(userRef, { flage: null }).catch(() => { });
          setUser((prev) => ({ ...prev, flage: null }));
        } else if (localState?.showFlag !== false && !user?.flage) {
          // ✅ User toggled flag on - add it
          const flagValue = getFlag();
          const userRef = ref(appdatabase, `users/${user.id}`);
          update(userRef, { flage: flagValue }).catch(() => { });
          setUser((prev) => ({ ...prev, flage: flagValue }));
        }
      }
    }
  }, [user?.id, isAdmin, localState?.showFlag, appdatabase, user?.flage]) // ✅ Check showFlag preference

  // ✅ Memoize resetUserState to prevent unnecessary re-renders
  const resetUserState = useCallback(() => {
    setUser({
      id: null,
      // selectedFruits: [],
      // isReminderEnabled: false,
      // isSelectedReminderEnabled: false,
      displayName: '',
      avatar: null,
      // rewardPoints: 0,
      isBlock: false,
      fcmToken: null,
      lastActivity: null,
      online: false,
      isPro: false,
      createdAt: null
    });
  }, []); // No dependencies, so it never re-creates

  // ✅ Memoize handleUserLogin
  const handleUserLogin = useCallback(async (loggedInUser) => {
    if (!loggedInUser) {
      resetUserState(); // No longer recreates resetUserState
      return;
    }
    try {
      const userId = loggedInUser.uid;
      const userRef = ref(appdatabase, `users/${userId}`);


      // 🔄 Fetch user data
      const snapshot = await get(userRef);
      let userData;

      const makeadmin = loggedInUser.email === 'thesolanalabs@gmail.com' || loggedInUser.email === 'sohailnasir74business@gmail.com' || loggedInUser.email === 'sohailnasir74@gmail.com';
      if (makeadmin) { setIsAdmin(makeadmin) }
      setCurrentuserEmail(loggedInUser.email)

      if (snapshot.exists()) {
        // ⏳ USER EXISTS → Keep existing createdAt
        const existing = snapshot.val();
        userData = {
          ...existing,
          id: userId,
          createdAt: existing.createdAt || Date.now()   // fallback if missing
        };

      } else {
        // 🆕 NEW USER → Set createdAt once
        userData = {
          ...createNewUser(userId, loggedInUser, robloxUsernameRef?.current),
          createdAt: Date.now()
        };

        await set(userRef, userData);
      }

      setUser(userData);

      // 🔥 Refresh and update FCM token
      await Promise.all([registerForNotifications(userId)]);

    } catch (error) {
      // console.error("❌ Auth state change error:", error);
    }
  }, [appdatabase, resetUserState]); // ✅ Uses memoized resetUserState
  useEffect(() => {
    if (!user?.id) return;

    const run = async () => {
      try {
        // console.log('Registering push token for user:', user.id);
        await registerForNotifications(user.id);
      } catch (e) {
        // console.log('registerForNotifications error', e);
      }
    };

    run();
  }, [user?.id]);


  const checkInternetConnection = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch('https://www.google.com', { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      // console.log('⚠️ No internet connection detected');
      return false;
    }
  };

  // ✅ Ensure useEffect runs only when necessary
  useEffect(() => {
    // 🛡️ Failsafe: Force app ready after 5 seconds if Firebase hangs (e.g., poor internet)
    const failsafeTimeout = setTimeout(async () => {
      // console.log('⚠️ App initialization timed out - forcing AppReady');
      await updateLocalState('isAppReady', true);
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (loggedInUser) => {
      if (loggedInUser && !loggedInUser.emailVerified) {
        await auth().signOut();
        // showErrorMessage("Email Not Verified", "Please check your inbox and verify your email.");
        clearTimeout(failsafeTimeout);
        return;
      }

      const handle = requestIdleCallback(async () => {
        // Optional: Check connection first
        // const isOnline = await checkInternetConnection();
        // if (!isOnline) console.log("⚠️ booting in offline mode");

        await handleUserLogin(loggedInUser);

        if (loggedInUser?.uid) {
          await registerForNotifications(loggedInUser.uid);
        }

        await updateLocalState('isAppReady', true);
        clearTimeout(failsafeTimeout); // ✅ Clear failsafe if successful
      });
    });

    return () => {
      unsubscribe();
      clearTimeout(failsafeTimeout);
    };
  }, []);



  useEffect(() => {
    const fetchAPIKeys = async () => {
      try {
        const apiRef = ref(appdatabase, 'api');
        const paywallSecondOnlyFlagRef = ref(appdatabase, 'single_offer_wall');
        const freeRef = ref(appdatabase, 'free_translation');

        const [snapshotApi, paywallSecondOnlyFlag, snapshotFree] = await Promise.all([
          get(apiRef),
          get(paywallSecondOnlyFlagRef),
          get(freeRef),
        ]);

        if (snapshotApi.exists()) {
          const value = snapshotApi.val();
          setApi(value);
        } else {
          // console.warn('⚠️ No Google Translate API key found at /api');
        }

        if (snapshotFree.exists()) {
          const value = snapshotFree.val();
          setFreeTranslation(value);
        } else {
          // console.warn('⚠️ No free translation key found at /free_translation');
        }
        if (paywallSecondOnlyFlag.exists()) {
          const value = paywallSecondOnlyFlag.val();
          // console.log('chec', value)
          setSingle_offer_wall(value);
          // console.log('🔑 [Firebase] Free Translation Key from /free_translation:', value);
        } else {
          // console.warn('⚠️ No free translation key found at /free_translation');
        }


      } catch (error) {
        // console.error('🔥 Error fetching API keys from Firebase:', error);
      }
    };

    fetchAPIKeys();
  }, []);

  // Fetch trading server link with 3 hour caching
  useEffect(() => {
    const fetchTradingServerLink = async () => {
      try {
        const lastServerFetch = localState.lastServerFetch ? new Date(localState.lastServerFetch).getTime() : 0;
        const now = Date.now();
        const timeElapsed = now - lastServerFetch;
        const EXPIRY_LIMIT = 3 * 60 * 60 * 1000; // 3 hours

        // Only fetch if expired or not cached
        if (timeElapsed > EXPIRY_LIMIT || !localState.tradingServerLink) {
          const serverRef = ref(appdatabase, 'server');
          const snapshot = await get(serverRef);

          if (snapshot.exists()) {
            const serverData = snapshot.val();
            // Convert to array and get first server link
            const serverList = Object.entries(serverData).map(([id, value]) => ({ id, ...value }));

            // Get the first server link (or you can filter by name if needed)
            const firstServer = serverList.length > 0 ? serverList[0] : null;
            const serverLink = firstServer?.link || null;

            if (serverLink) {
              setTradingServerLink(serverLink);
              await updateLocalState('tradingServerLink', serverLink);
              await updateLocalState('lastServerFetch', new Date().toISOString());
            }
          }
        } else {
          // Use cached link
          if (localState.tradingServerLink) {
            setTradingServerLink(localState.tradingServerLink);
          }
        }
      } catch (error) {
        // console.error('Error fetching trading server link:', error);
        // Fallback to cached link if available
        if (localState.tradingServerLink) {
          setTradingServerLink(localState.tradingServerLink);
        }
      }
    };

    if (appdatabase) {
      fetchTradingServerLink();
    }
  }, [appdatabase, localState.lastServerFetch, localState.tradingServerLink]);

  const updateUserProStatus = () => {
    if (!user?.id) {
      // console.error("User ID or database instance is missing!");
      return;
    }

    const userIsProRef = ref(appdatabase, `/users/${user?.id}/isPro`);

    set(userIsProRef, localState?.isPro)
      .then(() => {
      })
      .catch((error) => {
        // console.error("Error updating online status:", error);
      });
  };





  useEffect(() => {
    const handle = requestIdleCallback(() => {
      // checkInternetConnection();
      updateUserProStatus();
    });
    return () => cancelIdleCallback(handle);
  }, [user.id, localState.isPro]);


  useEffect(() => {
    // console.log("🕓 Saving lastActivity:", new Date().toISOString());
    updateLocalStateAndDatabase('lastActivity', new Date().toISOString());
  }, []);



  // const fetchStockData = async (refresh) => {
  //   try {
  //     setLoading(true);

  //     const lastActivity = localState.lastActivity ? new Date(localState.lastActivity).getTime() : 0;
  //     const now = Date.now();
  //     const timeElapsed = now - lastActivity;
  //     const EXPIRY_LIMIT = refresh ? 1 * 10 * 1000 : 1 * 6 * 60 * 1000; // 30 min or 6 hrs

  //     const shouldFetch =
  //       timeElapsed > EXPIRY_LIMIT ||
  //       !localState.data ||
  //       !Object.keys(localState.data).length ||
  //       !localState.imgurl;

  //     if (shouldFetch) {
  //       let data = {};
  //       let image = '';

  //       // ✅ First try to fetch `data` from Bunny CDN
  //       try {
  //         const dataRes = await fetch('https://adoptme.b-cdn.net');
  //         const dataJson = await dataRes.json();
  //         // console.log(dataJson)

  //         if (!dataJson || typeof dataJson !== 'object' || dataJson.error || !Object.keys(dataJson).length) {
  //           throw new Error('CDN returned invalid or error data');
  //         }

  //         data = dataJson;

  //         console.log('✅ Loaded data from Bunny CDN');
  //       } catch (err) {
  //         console.warn('⚠️ Failed to load from CDN, falling back to Firebase:', err.message);

  //         const xlsSnapshot = await get(ref(appdatabase, 'xlsData'));
  //         data = xlsSnapshot.exists() ? xlsSnapshot.val() : {};
  //       }

  //       // ✅ Always fetch `image_url` from Firebase
  //       const imageSnapShot = await get(ref(appdatabase, 'image_url'));
  //       image = imageSnapShot.exists() ? imageSnapShot.val() : '';

  //       // ✅ Store in local state
  //       await updateLocalState('data', JSON.stringify(data));
  //       await updateLocalState('imgurl', JSON.stringify(image));
  //       await updateLocalState('lastActivity', new Date().toISOString());
  //     }

  //   } catch (error) {
  //     console.error("❌ Error fetching stock data:", error);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const fetchStockData = async (refresh) => {
    try {
      setLoading(true);

      const lastActivity = localState.lastActivity ? new Date(localState.lastActivity).getTime() : 0;
      // console.log('lastActivity', lastActivity)
      const now = Date.now();
      const timeElapsed = now - lastActivity;
      const EXPIRY_LIMIT = refresh ? 1 * 1000 : 3 * 60 * 1000; // 10s for refresh, 6min default

      // Check if we need to fetch new data
      const shouldFetch =
        timeElapsed > EXPIRY_LIMIT ||
        !localState.data ||
        !Object.keys(localState.data).length;

      if (shouldFetch) {
        // TODO: REPLACE THIS WITH THE REAL API URL
        // User has not provided the full URL yet.
        const COSA_API_URL = 'https://cosapi.b-cdn.net/cos_catalog.json';

        // console.log('🌐 Fetching CoS data from:', COSA_API_URL);

        try {
          const res = await fetch(COSA_API_URL, {
            method: 'GET',
            cache: 'no-store',
          });

          if (!res.ok) {
            throw new Error(`API returned status ${res.status}`);
          }

          const json = await res.json();
          // console.log(json)

          if (!json || typeof json !== 'object') {
            // console.error('❌ API returned invalid JSON structure:', json);
            throw new Error('API returned invalid data');
          }

          // Parse the "cleaned" array from the response as per user provided structure
          const rawList = json.cleaned || [];
          // console.log(`📦 API Response contains ${rawList.length} items in 'cleaned' array.`);

          // Transform for easier consumption/lookup
          const dataMap = {};
          rawList.forEach(item => {
            if (item && item.id) {
              // Store entire item
              dataMap[item.id] = item;
            }
          });
          // console.log(`🗺️ Parsed ${Object.keys(dataMap).length} items into dataMap.`);

          // If rawList was empty but json was valid, warn?
          if (rawList.length === 0) {
            // console.warn('⚠️ API returned data but "cleaned" array was empty or missing. Full JSON keys:', Object.keys(json));
          }

          await updateLocalState('data', JSON.stringify(dataMap));
          await updateLocalState('lastActivity', new Date().toISOString());

          // Reset GG data as it's not used in CoS
          await updateLocalState('ggData', JSON.stringify({}));

        } catch (err) {
          // console.warn('⚠️ API fetch failed, using cached data:', err.message);
          const hasLocalData = localState.data && Object.keys(JSON.parse(localState.data || '{}')).length > 0;

          if (!hasLocalData) {
            // console.error('❌ No API data and no cached data available.');
          } else {
            // console.log('✅ Using cached data');
          }
        }
      }
    } catch (error) {
      // console.error("❌ Error fetching stock data:", error);
    } finally {
      setLoading(false);
    }
  };


  // console.log(user)

  // ✅ Run the function only if needed
  useEffect(() => {
    const handle = requestIdleCallback(() => {
      fetchStockData(); // ✅ Now runs after main thread is free
    });

    return () => cancelIdleCallback(handle);
  }, []);

  const reload = () => {
    fetchStockData(true);
  };



  // ✅ Set up online status tracking using separate presence node (RTDB-only, optimized for scale)
  // ✅ Foreground-only presence (ACTIVE = online, background/inactive = offline)
  // ✅ Uses presence/{uid} instead of users/{uid}/online for better scalability
  useEffect(() => {
    if (!user?.id || !appdatabase) return;

    const uid = user.id;
    const presenceRef = ref(appdatabase, `presence/${uid}`); // ✅ Separate presence node
    const connectedRef = ref(appdatabase, ".info/connected")

    let isConnected = false;
    let currentAppState = AppState.currentState; // 'active' | 'background' | 'inactive'
    let armedOnDisconnect = false;

    const setLocalOnline = (val) => {
      setUser((prev) => (prev?.id ? { ...prev, online: val } : prev));
    };

    const forceOffline = async () => {
      try {
        await set(presenceRef, false);
      } catch (e) {
        // log if you want: console.log("forceOffline error", e);
      }
      setLocalOnline(false);
    };

    let onDisconnectHandler = null;

    const armOnDisconnect = async () => {
      if (armedOnDisconnect) return;
      try {
        onDisconnectHandler = onDisconnect(presenceRef);
        await onDisconnectHandler.set(false);
        armedOnDisconnect = true;
      } catch (e) {
        // Handle error silently
      }
    };

    let running = false;
    let pending = false;

    const updatePresence = async () => {
      if (running) {
        pending = true;
        return;
      }
      running = true;

      try {
        if (localState?.showOnlineStatus === false) {
          try {
            if (onDisconnectHandler) {
              await onDisconnectHandler.cancel();
            }
          } catch { }
          armedOnDisconnect = false;
          await forceOffline();
          return;
        }

        if (!isConnected || currentAppState !== "active") {
          await forceOffline();
          return;
        }

        await armOnDisconnect();
        await set(presenceRef, true);
        setLocalOnline(true);

      } catch (e) {
        // console.log("updatePresence error", e);
      } finally {
        running = false;

        // ✅ if something changed while we were running, apply latest state once more
        if (pending) {
          pending = false;
          updatePresence();
        }
      }
    };



    // Listen to RTDB connection state
    const unsubConnected = onValue(connectedRef, (snap) => {
      isConnected = snap.val() === true;
      updatePresence();
    });

    // Listen to AppState changes
    const sub = AppState.addEventListener("change", (nextState) => {
      currentAppState = nextState;
      // immediately offline when background/inactive
      updatePresence();
    });

    // Initial sync
    updatePresence();

    return () => {
      // ✅ Cleanup: Mark user offline when component unmounts or user.id changes (logout)
      sub.remove();
      if (typeof unsubConnected === "function") unsubConnected();

      // ✅ Cancel onDisconnect handler if it exists
      if (onDisconnectHandler) {
        onDisconnectHandler.cancel().catch(() => { });
      }

      // ✅ Mark offline in RTDB (using closure to capture the old uid)
      // This ensures when user.id changes to null (logout), the previous user is marked offline
      set(presenceRef, false).catch(() => { });
      setLocalOnline(false);
    };
  }, [user?.id, appdatabase, localState?.showOnlineStatus]);



  // console.log(user)

  const contextValue = useMemo(
    () => ({
      user, auth,
      firestoreDB,
      appdatabase,
      theme,
      setUser,
      updateLocalStateAndDatabase,
      fetchStockData,
      loading,
      freeTranslation,
      isAdmin,
      reload,
      robloxUsernameRef, api, currentUserEmail, single_offer_wall, tradingServerLink,
    }),
    [user, theme, fetchStockData, loading, robloxUsernameRef, api, freeTranslation, currentUserEmail, auth, tradingServerLink]
  );

  return (
    <GlobalStateContext.Provider value={contextValue}>
      {children}
    </GlobalStateContext.Provider>
  );
};


