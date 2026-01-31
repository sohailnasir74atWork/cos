import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, FlatList, TextInput, Image, Pressable, Platform, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import ViewShot from 'react-native-view-shot';
import { useGlobalState } from '../GlobelStats';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import config from '../Helper/Environment';
import ConditionalKeyboardWrapper from '../Helper/keyboardAvoidingContainer';
import { useHaptic } from '../Helper/HepticFeedBack';
import { getDatabase, ref, get } from '@react-native-firebase/database';
import { useLocalState } from '../LocalGlobelStats';
import SignInDrawer from '../Firebase/SigninDrawer';

import { showSuccessMessage, showErrorMessage } from '../Helper/MessageHelper';
import { checkBanStatus } from '../ChatScreen/utils';

import InterstitialAdManager from '../Ads/IntAd';
import BannerAdComponent from '../Ads/bannerAds';
import Share from 'react-native-share';
import ShareTradeModal from '../Trades/ShareTradeModal';
import { addDoc, collection, serverTimestamp, doc, getDoc, setDoc } from '@react-native-firebase/firestore';
import SubscriptionScreen from '../SettingScreen/OfferWall';

const GRID_STEPS = [9, 12, 15, 18];

const createEmptySlots = (count) => Array(count).fill(null);





const getItemValue = (item) => {
  if (!item) return 0;
  // Use avgValue as the primary trading value. Fallback to guideValue if avg is missing/0?
  // User sample: active: true, avgValue: 13377.98
  return Number(item.avgValue || item.guideValue || 0);
};

// ✅ Helper to format numbers with k, m suffix
const formatCompactNumber = (number) => {
  if (number === undefined || number === null) return '0';
  const num = Number(number);
  if (isNaN(num)) return '0';

  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toLocaleString();
};



const getTradeStatus = (hasTotal, wantsTotal) => {
  // If both are 0 (initial state), show WIN
  if (hasTotal === 0 && wantsTotal === 0) return 'win';

  // If only has items are selected (wantsTotal is 0), show LOSE
  if (hasTotal > wantsTotal) return 'lose';

  // If only wants items are selected (hasTotal is 0), show WIN
  if (hasTotal < wantsTotal) return 'win';

  // If both have equal values, show FAIR
  return 'fair';
};

const HomeScreen = ({ selectedTheme }) => {
  const { theme, user, firestoreDB, single_offer_wall, reload } = useGlobalState();
  const tradesCollection = collection(firestoreDB, 'trades_new');
  const [gridStepIndex, setGridStepIndex] = useState(0); // 0 -> 9, 1 -> 12, 2 -> 15, 3 -> 18
  const [hasItems, setHasItems] = useState(() => createEmptySlots(GRID_STEPS[0]));
  const [wantsItems, setWantsItems] = useState(() => createEmptySlots(GRID_STEPS[0]));

  const [fruitRecords, setFruitRecords] = useState([]);
  const [selectedPetType, setSelectedPetType] = useState('ALL'); // Default to ALL
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [selectedSection, setSelectedSection] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [hasTotal, setHasTotal] = useState(0);
  const [wantsTotal, setWantsTotal] = useState(0);
  const { triggerHapticFeedback } = useHaptic();
  const { localState, updateLocalState } = useLocalState();
  // ✅ State for item selections (value types, fly, ride) for favorites
  const [itemSelections, setItemSelections] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [isSigninDrawerVisible, setIsSigninDrawerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [lastTradeTime, setLastTradeTime] = useState(null);
  const [adShowen, setadShowen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [type, setType] = useState(null);
  const platform = Platform.OS.toLowerCase();

  const isDarkMode = theme === 'dark';
  const viewRef = useRef();
  // ✅ Add refs to track timeouts and animation frames for cleanup
  const timeoutRefs = useRef({});
  const rafRefs = useRef({});
  const isMountedRef = useRef(true);
  // REMOVED LEGACY STATES: selectedValueType, isFlySelected, isRideSelected, isSharkMode
  const [isAddingToFavorites, setIsAddingToFavorites] = useState(false);
  const [isShareModalVisible, setIsShareModalVisible] = useState(false);
  const [debouncedSearchText, setDebouncedSearchText] = useState(searchText);
  const [factor, setFactor] = useState(null);
  const [showofferwall, setShowofferwall] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState(new Date());

  // ✅ Cleanup all timeouts and animation frames on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear all timeouts
      Object.values(timeoutRefs.current).forEach(id => {
        if (id) clearTimeout(id);
      });
      timeoutRefs.current = {};
      // Cancel all animation frames
      Object.values(rafRefs.current).forEach(id => {
        if (id) cancelAnimationFrame(id);
      });
      rafRefs.current = {};
    };
  }, []);

  const categories = useMemo(() => {
    // Standard static categories
    const staticCats = ['INVENTORY', 'ALL'];

    // Extract unique types from data
    const dynamicTypes = (fruitRecords || [])
      .map(item => item?.type)
      .filter(Boolean) // Remove null/undefined
      .map(type => type.toString()) // Ensure string
      // .map(type => type.toUpperCase()) // Optional: normalize case if needed
      .filter((value, index, self) => self.indexOf(value) === index); // Unique

    // Sort dynamic types alphabetically
    dynamicTypes.sort();

    // Combine: INVENTORY, ALL, [Dynamic Types...]
    // Note: If dynamic types include 'Creatures' or 'Tokens', they will be added here.
    // We filter out any that strictly match 'INVENTORY' or 'ALL' (case insensitive) to avoid duplicates
    const filteredDynamic = dynamicTypes.filter(t =>
      !['INVENTORY', 'ALL'].includes(t.toUpperCase())
    );

    return [...staticCats, ...filteredDynamic];
  }, [fruitRecords]);


  const tradeStatus = useMemo(() =>
    getTradeStatus(hasTotal, wantsTotal)
    , [hasTotal, wantsTotal]);


  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300); // Adjust delay as needed

    return () => clearTimeout(timeout);
  }, [searchText]);
  const progressBarStyle = useMemo(() => {
    // When both sides are empty, show a balanced fair state (50-50)
    if (!hasTotal && !wantsTotal) return { left: '50%', right: '50%' };

    const total = hasTotal + wantsTotal;
    const hasPercentage = (hasTotal / total) * 100;
    const wantsPercentage = (wantsTotal / total) * 100;

    return {
      left: `${hasPercentage}%`,
      right: `${wantsPercentage}%`
    };
  }, [hasTotal, wantsTotal]);



  const handleLoginSuccess = useCallback(() => {
    setIsSigninDrawerVisible(false);
  }, []);

  // ✅ Format last updated time as relative string
  const getLastUpdatedText = useCallback(() => {
    const now = new Date();
    const diffMs = now - lastUpdatedTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    return lastUpdatedTime.toLocaleDateString();
  }, [lastUpdatedTime]);

  // ✅ Hard refresh values - reloads data from CDN/Firebase
  const handleRefresh = useCallback(async () => {
    if (refreshing || !isMountedRef.current) return;

    triggerHapticFeedback('impactLight');
    setRefreshing(true);

    try {
      await reload(); // Re-fetch values data from CDN/Firebase
      // ✅ Check if component is still mounted before updating state
      if (!isMountedRef.current) return;
      // ✅ Update last refreshed time
      setLastUpdatedTime(new Date());
      // ✅ Show success message when values are reloaded
      showSuccessMessage('Success', 'Values have been reloaded');
    } catch (error) {
      console.error('Error refreshing values:', error);
      if (!isMountedRef.current) return;
      showErrorMessage('Error', 'Failed to reload values. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [reload, refreshing, triggerHapticFeedback]);

  const resetState = useCallback(() => {
    triggerHapticFeedback('impactLight');
    setSelectedSection(null);
    setHasTotal(0);
    setWantsTotal(0);
    setGridStepIndex(0);
    setHasItems(createEmptySlots(GRID_STEPS[0]));
    setWantsItems(createEmptySlots(GRID_STEPS[0]));
  }, [triggerHapticFeedback]);


  // ✅ getImageUrl - CoS API returns full URLs
  const getImageUrl = useCallback((item) => {
    if (!item) return '';
    return item.image || '';
  }, []);


  const updateTotal = useCallback((item, section, add = true, isNew = false) => {
    if (!item) return;

    const value = Number(item.selectedValue) || 0;
    const valueChange = isNew ? (add ? value : -value) : 0;

    if (section === 'has') {
      setHasTotal(prev => prev + valueChange);
    } else {
      setWantsTotal(prev => prev + valueChange);
    }
  }, []);

  const maybeExpandGrid = useCallback(
    (nextHasItems, nextWantsItems) => {
      const currentSize = GRID_STEPS[gridStepIndex];
      const maxStepIndex = GRID_STEPS.length - 1;

      const hasCount = nextHasItems.filter(Boolean).length;
      const wantsCount = nextWantsItems.filter(Boolean).length;

      // Already at max (18 slots per side)
      if (gridStepIndex === maxStepIndex) {
        setHasItems(nextHasItems);
        setWantsItems(nextWantsItems);
        return;
      }

      // If either side filled all current slots -> grow to next step
      if (hasCount >= currentSize || wantsCount >= currentSize) {
        const nextSize = GRID_STEPS[gridStepIndex + 1];
        const diff = nextSize - currentSize;

        setGridStepIndex((prev) => prev + 1);
        setHasItems([...nextHasItems, ...createEmptySlots(diff)]);
        setWantsItems([...nextWantsItems, ...createEmptySlots(diff)]);
      } else {
        setHasItems(nextHasItems);
        setWantsItems(nextWantsItems);
      }
    },
    [gridStepIndex]
  );


  const selectItem = useCallback(
    (item) => {
      if (!item || !selectedSection) return;

      triggerHapticFeedback('impactLight');

      const value = getItemValue(item);

      const selectedItem = {
        ...item,
        selectedValue: value,
      };

      // Work on copies of both sides so we can decide expansion
      const nextHasItems = [...hasItems];
      const nextWantsItems = [...wantsItems];

      const targetArray =
        selectedSection === 'has' ? nextHasItems : nextWantsItems;

      let nextEmptyIndex = targetArray.indexOf(null);

      // No empty slot left even at 18 → do nothing
      if (nextEmptyIndex === -1) {
        return;
      }

      targetArray[nextEmptyIndex] = selectedItem;

      // Update totals for the side we modified
      updateTotal(
        selectedItem,
        selectedSection === 'has' ? 'has' : 'wants',
        true,
        true
      );

      // This will also expand 9→12→15→18 if needed
      maybeExpandGrid(nextHasItems, nextWantsItems);

      setIsDrawerVisible(false);
    },
    [
      hasItems,
      wantsItems,
      selectedSection,
      triggerHapticFeedback,
      updateTotal,
      maybeExpandGrid,
    ]
  );


  const handleCellPress = useCallback((index, isHas) => {
    const items = isHas ? hasItems : wantsItems;

    const callbackfunction = () => { };

    if (items[index]) {
      triggerHapticFeedback('impactLight');
      const item = items[index];
      const updatedItems = [...items];
      updatedItems[index] = null;

      if (isHas) {
        setHasItems(updatedItems);
        updateTotal(item, 'has', false, true);
      } else {
        setWantsItems(updatedItems);
        updateTotal(item, 'wants', false, true);
      }
    } else {
      triggerHapticFeedback('impactLight');
      setSelectedSection(isHas ? 'has' : 'wants');
      setIsDrawerVisible(true);

      // ✅ Store timeout and animation frame IDs for cleanup
      const rafKey1 = `cellPress_${Date.now()}_1`;
      const timeoutKey1 = `cellPress_${Date.now()}_2`;
      const rafKey2 = `cellPress_${Date.now()}_3`;
      const timeoutKey2 = `cellPress_${Date.now()}_4`;

      rafRefs.current[rafKey1] = requestAnimationFrame(() => {
        if (!isMountedRef.current) return;

        timeoutRefs.current[timeoutKey1] = setTimeout(() => {
          if (!isMountedRef.current) return;

          if (!adShowen && index === 1 && !localState.isPro && !isHas) {
            rafRefs.current[rafKey2] = requestAnimationFrame(() => {
              if (!isMountedRef.current) return;

              timeoutRefs.current[timeoutKey2] = setTimeout(() => {
                if (!isMountedRef.current) return;

                try {
                  callbackfunction();
                } catch (err) {
                  console.warn('[AdManager] Failed to show ad:', err);
                  callbackfunction();
                }
                // Clean up after execution
                delete timeoutRefs.current[timeoutKey2];
              }, 400);
            });
          } else {
            callbackfunction();
          }
          // Clean up after execution
          delete timeoutRefs.current[timeoutKey1];
        }, 500);
      });
    }
  }, [hasItems, wantsItems, triggerHapticFeedback, updateTotal, adShowen, localState.isPro]);

  // Memoize the mode change effect to prevent unnecessary recalculations
  const updateItemsForMode = useCallback((items) => {
    return items.map(item => {
      if (!item) return null;
      const value = getItemValue(item);
      return { ...item, selectedValue: value };
    });
  }, []);

  // ✅ Optimize the mode change effect - Fixed: Only update when mode changes, not when items change
  useEffect(() => {
    // ✅ Check if component is still mounted
    if (!isMountedRef.current) return;

    // ✅ Use functional updates to avoid dependency on hasItems/wantsItems
    setHasItems(prevItems => {
      if (!isMountedRef.current) return prevItems; // Return previous state if unmounted
      const updated = updateItemsForMode(prevItems);
      const newTotal = updated.reduce((sum, item) => sum + (item?.selectedValue || 0), 0);
      if (isMountedRef.current) {
        setHasTotal(newTotal);
      }
      return updated;
    });

    setWantsItems(prevItems => {
      if (!isMountedRef.current) return prevItems; // Return previous state if unmounted
      const updated = updateItemsForMode(prevItems);
      const newTotal = updated.reduce((sum, item) => sum + (item?.selectedValue || 0), 0);
      if (isMountedRef.current) {
        setWantsTotal(newTotal);
      }
      return updated;
    });
  }, [updateItemsForMode]); // ✅ Removed hasItems/wantsItems from deps to prevent infinite loop

  // Add toggleFavorite function - Save only identifiers (name, type, id) for favorites
  const toggleFavorite = useCallback((item) => {
    if (!item || !item.name) return;

    const currentFavorites = localState.favorites || [];
    // ✅ Save only identifiers to keep favorites updated with latest values
    const favoriteIdentifier = {
      name: item.name,
      type: item.type,
      id: item.id,
    };

    const isFavorite = currentFavorites.some(
      fav => (fav.id && fav.id === item.id) ||
        (fav.name && fav.name.toLowerCase() === item.name.toLowerCase() && fav.type && fav.type.toLowerCase() === item.type?.toLowerCase())
    );

    let newFavorites;
    if (isFavorite) {
      // Remove by matching id or name+type
      newFavorites = currentFavorites.filter(
        fav => !((fav.id && fav.id === item.id) ||
          (fav.name && fav.name.toLowerCase() === item.name.toLowerCase() && fav.type && fav.type.toLowerCase() === item.type?.toLowerCase()))
      );
    } else {
      newFavorites = [...currentFavorites, favoriteIdentifier];
    }

    updateLocalState('favorites', newFavorites);
    triggerHapticFeedback('impactLight');
  }, [localState.favorites, updateLocalState, triggerHapticFeedback]);

  // Update filteredData to include favorites
  const memoizedFruitRecords = useMemo(() => {
    return fruitRecords.map(item => {
      if (!item) return null;
      return {
        ...item,
        cachedValue: getItemValue(item),
      };
    });
  }, [fruitRecords]);

  // Step 3: Use optimized filteredData
  const filteredData = useMemo(() => {
    let list;
    if (selectedPetType === 'INVENTORY') {
      // ✅ Match favorite identifiers with current fruitRecords to get latest data
      const favoriteIdentifiers = localState.favorites || [];
      list = favoriteIdentifiers
        .map(favIdentifier => {
          // Find matching item in fruitRecords by id or name+type
          const foundItem = memoizedFruitRecords.find(
            item => item && (
              (favIdentifier.id && item.id === favIdentifier.id) ||
              (favIdentifier.name && item.name &&
                item.name.toLowerCase() === favIdentifier.name.toLowerCase() &&
                favIdentifier.type && item.type &&
                item.type.toLowerCase() === favIdentifier.type.toLowerCase())
            )
          );
          return foundItem || null;
        })
        .filter(Boolean) // Remove nulls (items that no longer exist)
        .map(item => ({
          ...item,
          cachedValue: getItemValue(item),
        }));
    } else {
      list = memoizedFruitRecords;
    }
    return list
      .filter(item => {
        if (!item?.type) return false;
        const matchesSearch = item.name.toLowerCase().includes(debouncedSearchText.toLowerCase());

        let matchesType = false;
        if (selectedPetType === 'ALL') {
          matchesType = true;
        } else if (selectedPetType === 'INVENTORY') {
          matchesType = true; // Handled above by only selecting favs
        } else {
          // Exact match for "Creatures", "tokens" (from API) against "CREATURES", "TOKENS" (UI headers)
          // UI headers are uppercase, API types are Mixed/Title case ("Creatures", "tokens")
          matchesType = item.type.toLowerCase() === selectedPetType.toLowerCase();
        }

        return matchesSearch && matchesType;
      })
      .sort((a, b) => (b.cachedValue || 0) - (a.cachedValue || 0));
  }, [
    memoizedFruitRecords,
    debouncedSearchText,
    selectedPetType,
    localState.favorites,
  ]);

  // Debug Log - hidden for production
  // useEffect(() => {
  //   console.log(`🎨 HomeScreen: Rendering ${filteredData.length} items. Selected Type: ${selectedPetType}`);
  // }, [filteredData.length, selectedPetType]);

  // ✅ Handler for badge presses in favorites (N, M, D, R, F)
  const handleFavoriteBadgePress = useCallback((itemId, badge) => {
    // NO-OP for now as badges are not supported in CoS
  }, []);

  // ✅ BadgeButton component for favorites
  const BadgeButton = useCallback(({ badge, isActive, onPress }) => {
    // Badge logic removed
    return null;
  }, []);

  // ✅ Render favorite item in original row layout but with Synced Color Inspiration
  const renderFavoriteItem = useCallback(({ item }) => {
    const imageUrl = getImageUrl(item);
    const currentValue = getItemValue(item);

    // Handler to add item to calculator
    const handleAddToCalculator = () => {
      if (!selectedSection) return;
      triggerHapticFeedback('impactLight');

      const selectedItem = {
        ...item,
        selectedValue: currentValue,
      };

      const nextHasItems = [...hasItems];
      const nextWantsItems = [...wantsItems];
      const targetArray = selectedSection === 'has' ? nextHasItems : nextWantsItems;
      let nextEmptyIndex = targetArray.indexOf(null);

      if (nextEmptyIndex === -1) return;

      targetArray[nextEmptyIndex] = selectedItem;
      updateTotal(selectedItem, selectedSection === 'has' ? 'has' : 'wants', true, true);
      maybeExpandGrid(nextHasItems, nextWantsItems);
      setIsDrawerVisible(false);
    };

    return (
      <View style={styles.favoriteRowItem}>
        {/* Left side: Image and Info (clickable to add to calculator) */}
        <TouchableOpacity
          style={styles.favoriteClickableArea}
          onPress={handleAddToCalculator}
          activeOpacity={0.7}
        >
          <View style={styles.favoriteImageContainer}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.favoriteItemImage} />
            ) : (
              <View style={[styles.favoriteItemImage, { backgroundColor: isDarkMode ? '#333' : '#ddd', justifyContent: 'center', alignItems: 'center' }]}>
                <Icon name="image-outline" size={18} color={isDarkMode ? '#666' : '#999'} />
              </View>
            )}
          </View>

          <View style={styles.favoriteItemInfo}>
            <Text style={styles.favoriteItemName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.favoriteItemValue}>Value: {formatCompactNumber(currentValue)}</Text>

            <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
              {item.type && (() => {
                const colors = config.getTagColor('type', isDarkMode);
                return (
                  <View style={{ backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 6, borderRadius: 4 }}>
                    <Text style={{ fontSize: 8, color: colors.text, fontWeight: '700' }}>{item.type.toUpperCase()}</Text>
                  </View>
                );
              })()}
              {item.rarity && (() => {
                const colors = config.getTagColor('rarity', isDarkMode);
                return (
                  <View style={{ backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 6, borderRadius: 4 }}>
                    <Text style={{ fontSize: 8, color: colors.text, fontWeight: '700' }}>{item.rarity.toUpperCase()}</Text>
                  </View>
                );
              })()}
            </View>
          </View>
        </TouchableOpacity>

        {/* Right side: Delete button */}
        <TouchableOpacity
          style={styles.favoriteDeleteButton}
          activeOpacity={0.8}
          onPress={() => {
            triggerHapticFeedback('impactLight');
            toggleFavorite(item);
          }}
        >
          <Icon name="close-circle" size={20} color="#e74c3c" />
        </TouchableOpacity>
      </View>
    );
  }, [selectedSection, hasItems, wantsItems, updateTotal, maybeExpandGrid, triggerHapticFeedback, toggleFavorite, isDarkMode, getImageUrl, getItemValue, styles]);

  // Update renderGridItem to handle non-favorites mode
  const renderGridItem = useCallback(({ item }) => {
    const imageUrl = getImageUrl(item);
    const isFavorite = (localState.favorites || []).some(
      fav => (fav.id && fav.id === item.id) ||
        (fav.name && fav.name.toLowerCase() === item.name?.toLowerCase() && fav.type && fav.type.toLowerCase() === item.type?.toLowerCase())
    );

    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => {
          if (isAddingToFavorites) {
            // When in "add to favorites" mode, clicking toggles favorite
            toggleFavorite(item);
          } else {
            // Normal mode: clicking adds item to calculator
            selectItem(item);
          }
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.gridItemImage}
          />
        ) : (
          <View style={[styles.gridItemImage, { backgroundColor: isDarkMode ? '#333' : '#ddd', justifyContent: 'center', alignItems: 'center' }]}>
            <Icon name="image-outline" size={30} color={isDarkMode ? '#666' : '#999'} />
          </View>
        )}
        <Text numberOfLines={1} style={styles.gridItemText}>
          {item.name}
        </Text>
        {isAddingToFavorites && (
          <TouchableOpacity
            style={styles.favoriteButton}
            activeOpacity={0.8}
            onPress={() => {
              toggleFavorite(item);
            }}
          >
            <Icon
              name={isFavorite ? "heart" : "heart-outline"}
              size={20}
              color={isFavorite ? "#e74c3c" : "#666"}
            />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [selectItem, toggleFavorite, localState.favorites, isAddingToFavorites, isDarkMode]);

  // Update renderFavoritesHeader function
  const renderFavoritesHeader = useCallback(() => {
    if (selectedPetType === 'INVENTORY') {
      return (
        <View style={styles.favoritesHeader}>
          <Text style={styles.favoritesTitle}>My Inventory</Text>
        </View>
      );
    }
    return null;
  }, [selectedPetType]);

  // Update renderFavoritesFooter function
  const renderFavoritesFooter = useCallback(() => {
    if (selectedPetType === 'INVENTORY') {
      return (
        <View style={styles.badgeContainer}>
          <TouchableOpacity
            style={styles.addToFavoritesButton}
            onPress={() => {
              setIsAddingToFavorites(true);
              setSelectedPetType('ALL');
            }}
          >
            <Icon name="add-circle" size={30} color={config.colors.hasBlockGreen} />
            <Text style={styles.addToFavoritesText}>Add Items to Inventory</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  }, [selectedPetType]);

  // Memoize key extractor
  const keyExtractor = useCallback((item, index) =>
    item.id?.toString() || `${item.name}-${item.type}-${index}`, []);


  // Optimize FlatList performance
  const getItemLayout = useCallback((data, index) => {
    // For favorites: row layout with larger height, for grid: smaller height
    const itemHeight = selectedPetType === 'INVENTORY' && !isAddingToFavorites ? 100 : 100;
    return {
      length: itemHeight,
      offset: itemHeight * index,
      index,
    };
  }, [selectedPetType, isAddingToFavorites]);



  useEffect(() => {
    let isMounted = true;

    const fetchFactor = async () => {
      try {
        const database = getDatabase();
        const snapshot = await get(ref(database, 'factor'));
        const factor = snapshot.val();
        // ✅ Check if component is still mounted before updating state
        if (isMounted) {
          setFactor(factor);
        }
      } catch (error) {
        console.error('Error fetching factor:', error);
      }
    };

    fetchFactor();

    return () => {
      isMounted = false;
    };
  }, []);



  useEffect(() => {
    let isMounted = true;

    const parseAndSetData = async () => {
      try {
        const source = localState.data;

        if (!source) {
          if (isMounted) setFruitRecords([]);
          return;
        }

        const parsed = typeof source === 'string' ? JSON.parse(source) : source;

        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          if (isMounted) {
            setFruitRecords(Object.values(parsed));
          }
        } else {
          if (isMounted) setFruitRecords([]);
        }
      } catch (err) {
        console.error("❌ Error parsing data in HomeScreen:", err);
        if (isMounted) setFruitRecords([]);
      }
    };

    parseAndSetData();

    return () => {
      isMounted = false;
    };
  }, [localState.data]); // ✅ Added dependencies so it updates when values are refreshed

  // console.log(filteredData.length)





  const handleCreateTradePress = useCallback(() => {
    // console.log(user.id);
    if (!user?.id) {
      setIsSigninDrawerVisible(true); // Open SignInDrawer if not logged in
      return;
    }

    // ✅ Store timeout ID for cleanup
    const timeoutKey = `createTrade_${Date.now()}`;
    timeoutRefs.current[timeoutKey] = setTimeout(() => {
      if (!isMountedRef.current) return;

      const hasItemsCount = hasItems.filter(Boolean).length;
      const wantsItemsCount = wantsItems.filter(Boolean).length;

      if (hasItemsCount === 0 && wantsItemsCount === 0) {
        showErrorMessage("Error", "Missing required items for the trade.");
        return;
      }

      setType('create');
      setModalVisible(true);
      // Clean up after execution
      delete timeoutRefs.current[timeoutKey];
    }, 100); // Small delay to allow React state to settle
  }, [hasItems, wantsItems, user?.id]);

  const handleCreateTrade = useCallback(async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      // 🔒 Check Ban Status
      const banStatus = await checkBanStatus(user?.email);
      if (banStatus.isBanned) {
        setIsSubmitting(false);
        // Alert.alert('Banned', banStatus.message);
        showErrorMessage("Banned", banStatus.message);
        return;
      }

      // ✅ FIRESTORE ONLY: Read rating summary from user_ratings_summary (single source of truth)
      let userRating = null;
      let ratingCount = 0;

      if (firestoreDB && user?.id) {
        const summaryDocSnap = await getDoc(doc(firestoreDB, 'user_ratings_summary', user.id));

        // Fix: Check if summaryDocSnap is an object before calling exists()
        if (summaryDocSnap && typeof summaryDocSnap === 'object' && typeof summaryDocSnap.exists === 'function' && summaryDocSnap.exists()) {
          const summaryData = summaryDocSnap.data();
          userRating = summaryData.averageRating || null;
          ratingCount = summaryData.count || 0;
        } else {
          // ✅ ONE-TIME MIGRATION: If Firestore summary doesn't exist, check RTDB and migrate (legacy data only)
          // This is a temporary migration path for existing data. New ratings only use Firestore.
          const database = getDatabase();
          const avgRatingSnap = await ref(database, `averageRatings/${user.id}`).once('value');
          const avgRatingData = avgRatingSnap.val();

          if (avgRatingData) {
            userRating = avgRatingData.value || null;
            ratingCount = avgRatingData.count || 0;

            // ✅ ONE-TIME MIGRATION: Copy to Firestore (async, don't wait)
            if (userRating || ratingCount > 0) {
              setDoc(
                doc(firestoreDB, 'user_ratings_summary', user.id),
                {
                  averageRating: userRating || 0,
                  count: ratingCount || 0,
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              ).catch(err => console.error('Error migrating rating summary to Firestore:', err));
            }
          }
        }
      }
      const now = Date.now(); // ✅ Use Date.now() for cooldown comparison
      const timestamp = serverTimestamp(); // ✅ Use serverTimestamp() for Firestore

      // ✅ Calculate hasRecentGameWin (similar to Trader.jsx)
      const hasRecentWin =
        typeof user?.lastGameWinAt === 'number' &&
        now - user.lastGameWinAt <= 24 * 60 * 60 * 1000; // last win within 24h

      const mapTradeItem = item => ({
        name: item.name || item.Name,
        type: item.type || item.Type,
        image: item.image ? item.image : '',
      });

      // ✅ Create indexed arrays for server-side search - OPTIMIZED: Store only full names + words (not prefixes)
      // Prefixes are generated on search side to reduce storage costs
      const createSearchTokens = (itemName) => {
        const name = itemName.toLowerCase().trim();
        const tokens = [name]; // Full name for exact match

        // Split into words and add each word as a token (for partial word matching)
        const words = name.split(/\s+/).filter(w => w.length > 0);
        tokens.push(...words);

        // ✅ OPTIMIZED: Don't store prefixes here - they're generated on search side
        // This reduces storage costs significantly (from ~10-20 tokens/item to ~2-3 tokens/item)

        return [...new Set(tokens)]; // Remove duplicates
      };

      const hasItemNames = hasItems
        .filter(item => item && (item.name || item.Name))
        .flatMap(item => createSearchTokens(item.name || item.Name));

      const wantsItemNames = wantsItems
        .filter(item => item && (item.name || item.Name))
        .flatMap(item => createSearchTokens(item.name || item.Name));

      // ✅ Calculate trade status and convert to single letter: 'w' (win), 'l' (lose), 'f' (fair)
      const tradeStatus = getTradeStatus(hasTotal, wantsTotal);
      const statusLetter = tradeStatus === 'win' ? 'w' : tradeStatus === 'lose' ? 'l' : 'f';

      const newTrade = {
        userId: user?.id || "Anonymous",
        traderName: user?.displayName || "Anonymous",
        avatar: user?.avatar || null,
        isPro: localState.isPro,
        isFeatured: false,
        hasItems: hasItems.filter(item => item && (item.name || item.Name)).map(mapTradeItem),
        wantsItems: wantsItems.filter(item => item && (item.name || item.Name)).map(mapTradeItem),
        hasItemNames, // ✅ Indexed array for server-side search (lowercase)
        wantsItemNames, // ✅ Indexed array for server-side search (lowercase)
        hasTotal,
        wantsTotal,
        description: description || "",
        timestamp: timestamp, // ✅ Use serverTimestamp for Firestore
        status: statusLetter, // ✅ Trade status: 'w' (win), 'l' (lose), 'f' (fair)
        rating: userRating,
        ratingCount,

        flage: user.flage ? user.flage : null,
        robloxUsername: user?.robloxUsername || null,
        robloxUsernameVerified: user?.robloxUsernameVerified || false,
        hasRecentGameWin: hasRecentWin, // ✅ Game win info
        lastGameWinAt: user?.lastGameWinAt || null, // ✅ Game win timestamp


      };

      // ✅ 2-minute cooldown check (using Date.now() for accurate comparison)
      const COOLDOWN_MS = 120000; // 2 minutes
      if (lastTradeTime && (now - lastTradeTime) < COOLDOWN_MS) {
        const secondsLeft = Math.ceil((COOLDOWN_MS - (now - lastTradeTime)) / 1000);
        const minutesLeft = Math.floor(secondsLeft / 60);
        const remainingSeconds = secondsLeft % 60;
        const timeMessage = minutesLeft > 0
          ? `${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} and ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`
          : `${secondsLeft} second${secondsLeft === 1 ? '' : 's'}`;
        if (!isMountedRef.current) return;
        showErrorMessage("Error", `Please wait ${timeMessage} before creating a new trade.`);
        setIsSubmitting(false);
        return;
      }


      await addDoc(tradesCollection, newTrade);
      // ✅ Check if component is still mounted before updating state
      if (!isMountedRef.current) return;

      // Step 1: Close modal first
      setModalVisible(false);

      // Step 2: Reset calculator (both sides) after successful trade creation
      resetState();
      setDescription(''); // ✅ Clear description input

      // Step 3: Define the success callback
      const callbackfunction = () => {
        if (!isMountedRef.current) return;
        showSuccessMessage("Success", "Your trade has been posted successfully!");
      };

      // Step 4: Update timestamp and analytics
      if (isMountedRef.current) {
        setLastTradeTime(now); // ✅ Use Date.now() for cooldown tracking
      }

      // ✅ Store timeout and animation frame IDs for cleanup
      const rafKey1 = `createTrade_raf_${Date.now()}_1`;
      const timeoutKey1 = `createTrade_timeout_${Date.now()}_1`;
      const rafKey2 = `createTrade_raf_${Date.now()}_2`;
      const timeoutKey2 = `createTrade_timeout_${Date.now()}_2`;

      // Step 5: Wait for next frame (modal animation finish) then delay for iOS
      rafRefs.current[rafKey1] = requestAnimationFrame(() => {
        if (!isMountedRef.current) return;

        // Wait for modal animation to finish before showing ad
        timeoutRefs.current[timeoutKey1] = setTimeout(() => {
          if (!isMountedRef.current) return;

          if (!localState.isPro) {
            rafRefs.current[rafKey2] = requestAnimationFrame(() => {
              if (!isMountedRef.current) return;

              timeoutRefs.current[timeoutKey2] = setTimeout(() => {
                if (!isMountedRef.current) return;

                try {
                  // Pass callback for BOTH success (closed) and failure (unavailable)
                  InterstitialAdManager.showAd(
                    callbackfunction, // onAdClosed
                    callbackfunction  // onAdUnavailable
                  );
                } catch (err) {
                  console.warn('[AdManager] Failed to show ad:', err);
                  callbackfunction();
                }
                // Clean up after execution
                delete timeoutRefs.current[timeoutKey2];
              }, 400); // Adjust based on animation time
            });
          } else {
            callbackfunction();
          }
          // Clean up after execution
          delete timeoutRefs.current[timeoutKey1];
        }, 500); // Give modal time to fully disappear on iOS
      });

    } catch (error) {
      console.error("Error creating trade:", error);
      if (!isMountedRef.current) return;
      showErrorMessage("Error", "Something went wrong while posting the trade.");
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }, [isSubmitting, user, localState.isPro, hasItems, wantsItems, description, type, lastTradeTime, tradesCollection, resetState]);

  const handleShareTrade = useCallback(() => {
    const hasItemsCount = hasItems.filter(Boolean).length;
    const wantsItemsCount = wantsItems.filter(Boolean).length;

    if (hasItemsCount === 0 && wantsItemsCount === 0) {
      showErrorMessage("Error", "Missing required items for the trade.");
      return;
    }

    setIsShareModalVisible(true);
  }, [hasItems, wantsItems]);

  const profitLoss = wantsTotal - hasTotal;
  const isProfit = profitLoss >= 0;
  const neutral = profitLoss === 0;

  const styles = useMemo(() => getStyles(isDarkMode), [isDarkMode]);

  const lastFilledIndexHas = useMemo(() =>
    hasItems.reduce((lastIndex, item, index) => (item ? index : lastIndex), -1)
    , [hasItems]);

  const lastFilledIndexWant = useMemo(() =>
    wantsItems.reduce((lastIndex, item, index) => (item ? index : lastIndex), -1)
    , [wantsItems]);



  return (
    <>
      <GestureHandlerRootView>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <ViewShot ref={viewRef} style={styles.screenshotView}>
              {config.isNoman && (
                <View style={styles.summaryContainer}>
                  <View style={styles.summaryInner}>
                    <View style={styles.topSection}>
                      <Text style={styles.bigNumber}>{formatCompactNumber(hasTotal)}</Text>
                      <View style={styles.statusContainer}>
                        <Text style={[
                          styles.statusText,
                          tradeStatus === 'fair' ? {
                            ...styles.statusActive,
                            backgroundColor: config.colors.secondary // Blue for fair
                          } : styles.statusInactive
                        ]}>FAIR</Text>
                        <Text style={[
                          styles.statusText,
                          tradeStatus === 'win' ? {
                            ...styles.statusActive,
                            backgroundColor: '#10B981' // Green for win
                          } : styles.statusInactive
                        ]}>WIN</Text>
                        <Text style={[
                          styles.statusText,
                          tradeStatus === 'lose' ? {
                            ...styles.statusActive,
                            backgroundColor: config.colors.primary // Primary color for lose
                          } : styles.statusInactive
                        ]}>LOSE</Text>
                      </View>
                      <Text style={styles.bigNumber}>{formatCompactNumber(wantsTotal)}</Text>
                    </View>
                    {/* <View style={styles.progressContainer}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressLeft,
                            { width: progressBarStyle.left }
                          ]}
                        />
                        <View
                          style={[
                            styles.progressRight,
                            { width: progressBarStyle.right }
                          ]}
                        />
                      </View>
                    </View> */}

                    <View style={styles.profitLossBox}>
                      <Text style={[styles.bigNumber2, { color: isProfit ? config.colors.hasBlockGreen : config.colors.wantBlockRed }]}>
                        {formatCompactNumber(Math.abs(profitLoss))}
                      </Text>
                      <View style={[styles.divider, { position: 'absolute', right: 0, bottom: 0 }]}>
                        <Image
                          source={require('../../assets/reset.png')}
                          style={{ width: 18, height: 18, tintColor: 'white' }}
                          onTouchEnd={resetState}
                        />
                      </View>
                      {/* Last Updated Section */}

                    </View>
                  </View>
                </View>
              )}

              <View style={styles.labelContainer}>
                <Text style={styles.offerLabel}>ME</Text>
                <Text style={styles.dividerText}></Text>
                <Text style={styles.offerLabel}>YOU</Text>
                {/* ✅ Modern Refresh Button */}

              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={styles.itemRow}>
                  {hasItems?.map((item, index) => {
                    // For 3 columns
                    const isLastColumn = (index + 1) % 3 === 0;
                    const isLastRow = index >= hasItems.length - 3;
                    return (
                      <TouchableOpacity
                        key={`has-${item?.name || 'empty'}-${index}`}
                        style={[
                          styles.addItemBlockNew,
                          isLastColumn && { borderRightWidth: 0 },
                          isLastRow && { borderBottomWidth: 0 }
                        ]}
                        onPress={() => handleCellPress(index, true)}
                      >
                        {item ? (
                          <>
                            <Image
                              source={{ uri: getImageUrl(item) }}
                              style={[styles.itemImageOverlay]}
                            />

                          </>
                        ) : (
                          index === lastFilledIndexHas + 1 && (
                            <Icon
                              name="add-circle"
                              size={30}
                              color={isDarkMode ? "#fdf7e5" : '#fdf7e5'}
                            />
                          )
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={[styles.itemRow]}>
                  {wantsItems?.map((item, index) => {
                    const isLastColumn = (index + 1) % 3 === 0;
                    const isLastRow = index >= wantsItems.length - 3;
                    return (
                      <TouchableOpacity
                        key={`want-${item?.name || 'empty'}-${index}`}
                        style={[
                          styles.addItemBlockNew,
                          isLastColumn && { borderRightWidth: 0 },
                          isLastRow && { borderBottomWidth: 0 }
                        ]}
                        onPress={() => handleCellPress(index, false)}
                      >
                        {item ? (
                          <>
                            <Image
                              source={{ uri: getImageUrl(item) }}

                              style={[styles.itemImageOverlay]}
                            />

                          </>
                        ) : (
                          index === lastFilledIndexWant + 1 && (
                            <Icon
                              name="add-circle"
                              size={30}
                              color={isDarkMode ? "#fdf7e5" : '#fdf7e5'}
                            />
                          )
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <TouchableOpacity
                style={styles.lastUpdatedContainer}
                onPress={handleRefresh}
                disabled={refreshing}
                activeOpacity={0.7}
              >
                <View style={styles.lastUpdatedContent}>
                  {refreshing ? (
                    <ActivityIndicator size="small" color={config.colors.primary} style={{ marginRight: 6 }} />
                  ) : (
                    <Icon name="time-outline" size={14} color={isDarkMode ? '#aaa' : '#888'} style={{ marginRight: 6 }} />
                  )}
                  <Text style={[styles.lastUpdatedText, { color: isDarkMode ? '#aaa' : '#666' }]}>
                    {refreshing ? 'Updating...' : `Updated ${getLastUpdatedText()}`}
                  </Text>
                  {!refreshing && (
                    <Icon name="refresh-outline" size={14} color={config.colors.primary} style={{ marginLeft: 6 }} />
                  )}
                </View>
              </TouchableOpacity>



              {!config.isNoman && (
                <View style={styles.summaryContainer}>
                  <View style={[styles.summaryBox, styles.hasBox]}>
                    <View style={{ width: '90%', backgroundColor: '#e0e0e0', alignSelf: 'center', }} />
                    <View style={{ justifyContent: 'space-between', flexDirection: 'row' }} >
                      <Text style={styles.priceValue}>Value:</Text>
                      <Text style={styles.priceValue}>${formatCompactNumber(hasTotal)}</Text>
                    </View>
                  </View>
                  <View style={[styles.summaryBox, styles.wantsBox]}>
                    <View style={{ width: '90%', backgroundColor: '#e0e0e0', alignSelf: 'center', }} />
                    <View style={{ justifyContent: 'space-between', flexDirection: 'row' }} >
                      <Text style={styles.priceValue}>Value:</Text>
                      <Text style={styles.priceValue}>${formatCompactNumber(wantsTotal)}</Text>
                    </View>
                  </View>
                </View>
              )}
            </ViewShot>
            <View style={styles.createtrade}>
              <TouchableOpacity
                style={styles.createtradeButton}
                onPress={() => handleCreateTradePress()}
              >
                <Text style={{ color: 'white' }}>Create Trade</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shareTradeButton}
                onPress={handleShareTrade}
              >
                <Text style={{ color: 'white' }}>Share Trade</Text>
              </TouchableOpacity>
            </View>
            {!localState.isPro && <View style={styles.createtradeAds}>
              <TouchableOpacity
                style={styles.removeAdsButton}
                activeOpacity={0.9}
                onPress={() => setShowofferwall(true)}
              >
                <View style={styles.removeAdsContent}>
                  {/* Crown icon / image */}
                  <View style={styles.crownWrapper}>
                    {/* <Icon name="trophy" size={18} color="#3b2500" /> */}

                    <Image
                      source={require('../../assets/pro.png')}
                      style={{ width: 20, height: 20 }}
                      resizeMode="contain"
                    />

                  </View>

                  <View style={styles.removeAdsTextWrapper}>
                    <Text style={styles.removeAdsTitle}>Remove Ads</Text>
                    {/* <Text style={styles.removeAdsSubtitle}>Unlock a clean experience</Text> */}
                  </View>
                </View>
              </TouchableOpacity>
            </View>}

          </ScrollView>
          <Modal
            visible={isDrawerVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setIsDrawerVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setIsDrawerVisible(false)} />
            <View style={styles.drawerContainer}>
              <View style={styles.drawerHeader}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search..."
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholderTextColor={isDarkMode ? '#999' : '#666'}
                />
                <TouchableOpacity
                  onPress={() => setIsDrawerVisible(false)}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeButtonText}>CLOSE</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.drawerContent}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={styles.categoryListScroll}
                  contentContainerStyle={styles.categoryList}
                >
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.categoryButton,
                        selectedPetType === category && styles.categoryButtonActive
                      ]}
                      onPress={() => {
                        setSelectedPetType(category);
                        if (category !== 'INVENTORY') {
                          setIsAddingToFavorites(false);
                        } else {
                          // ✅ Force refresh when switching to INVENTORY tab
                          setIsAddingToFavorites(false);
                          // Trigger a re-render by updating a dummy state
                          // The filteredData will recalculate because it depends on localState.favorites
                        }
                      }}
                    >
                      <Text style={[
                        styles.categoryButtonText,
                        selectedPetType === category && styles.categoryButtonTextActive
                      ]}>{category.charAt(0).toUpperCase() + category.slice(1).toLowerCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.gridContainer}>
                  {renderFavoritesHeader()}
                  <FlatList
                    key={`${selectedPetType}-${isAddingToFavorites ? 'add' : 'view'}-${(localState.favorites || []).length}`}
                    data={filteredData}
                    keyExtractor={keyExtractor}
                    renderItem={selectedPetType === 'INVENTORY' && !isAddingToFavorites ? renderFavoriteItem : renderGridItem}
                    numColumns={selectedPetType === 'INVENTORY' && !isAddingToFavorites ? 1 : 3}
                    initialNumToRender={12}
                    maxToRenderPerBatch={12}
                    windowSize={5}
                    removeClippedSubviews={true}
                    getItemLayout={selectedPetType === 'INVENTORY' && !isAddingToFavorites ? undefined : getItemLayout}
                  />
                  {selectedPetType === 'INVENTORY' && renderFavoritesFooter()}
                </View>
              </View>
            </View>
          </Modal>
          <Modal
            visible={modalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setModalVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)} />
            <ConditionalKeyboardWrapper>
              <View style={{ flexDirection: 'row', flex: 1 }}>
                <View style={[styles.drawerContainer2, { backgroundColor: isDarkMode ? '#3B404C' : 'white' }]}>
                  <Text style={styles.modalMessage}>
                    Describe your trade
                  </Text>
                  <Text style={styles.modalMessagefooter}>
                    Add a short description to let others know what you are looking for.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Write description..."
                    maxLength={40}
                    value={description}
                    onChangeText={setDescription}
                  />
                  <View style={styles.buttonContainer}>
                    <TouchableOpacity
                      style={[styles.button, styles.cancelButton]}
                      onPress={() => setModalVisible(false)}
                    >
                      <Text style={styles.buttonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, styles.confirmButton]}
                      onPress={handleCreateTrade}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.buttonText}>
                        {isSubmitting ? 'Submitting' : 'Confirm'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ConditionalKeyboardWrapper>
          </Modal>

          <SignInDrawer
            visible={isSigninDrawerVisible}
            onClose={handleLoginSuccess}
            selectedTheme={selectedTheme}
            screen='Chat'
            message="Sign in required"
          />
        </View>
        <SubscriptionScreen visible={showofferwall} onClose={() => setShowofferwall(false)} track='Home' oneWallOnly={single_offer_wall} showoffer={!single_offer_wall} />
      </GestureHandlerRootView>
      {!localState.isPro && <BannerAdComponent />}
      <ShareTradeModal
        visible={isShareModalVisible}
        onClose={() => setIsShareModalVisible(false)}
        hasItems={hasItems}
        wantsItems={wantsItems}
        hasTotal={hasTotal}
        wantsTotal={wantsTotal}
        description={description}
      />
    </>
  );
};

const getStyles = (isDarkMode) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDarkMode ? '#121212' : '#f2f2f7',
      paddingBottom: 5,
    },
    summaryContainer: {
      width: '100%',

    },
    summaryInner: {
      backgroundColor: isDarkMode ? '#1e1e1e' : '#ffffff',
      borderRadius: 15,
      marginBottom: 10,
      padding: 10,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 3.84,
      elevation: 2,
    },
    topSection: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    bigNumber: {
      fontSize: 22,
      fontWeight: 'bold',
      textAlign: 'center',
      color: isDarkMode ? '#ffffff' : '#333',
      minWidth: 100
    },
    bigNumber2: {
      fontSize: 40,
      fontWeight: 'bold',
      textAlign: 'center',
      color: isDarkMode ? '#ffffff' : '#333',
    },
    statusContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: isDarkMode ? '#23272f' : 'rgba(0, 0, 0, 0.05)',
      borderRadius: 20,
      padding: 5,
      paddingHorizontal: 8,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      paddingHorizontal: 10,
    },
    statusActive: {
      color: 'white',
      backgroundColor: config.colors.hasBlockGreen,
      borderRadius: 20,
    },
    statusInactive: {
      color: isDarkMode ? '#6b7280' : '#999',
    },
    progressContainer: {
      marginVertical: 5,
    },
    progressBar: {
      height: 6,
      flexDirection: 'row',
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: isDarkMode ? '#23272f' : '#f0f0f0',
    },
    progressLeft: {
      height: '100%',
      backgroundColor: config.colors.hasBlockGreen,
      transition: 'width 0.3s ease',
    },
    progressRight: {
      height: '100%',
      backgroundColor: config.colors.wantBlockRed,
      transition: 'width 0.3s ease',
    },
    labelContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-evenly',
      flex: 1,
      width: '100%',
      position: 'relative',
    },
    offerLabel: {
      fontSize: 12,
      color: isDarkMode ? '#888' : '#666',
      fontWeight: 'bold',
      paddingBottom: 5,
    },
    dividerText: {
      fontSize: 14,
      color: '#999',
      paddingHorizontal: 5,
    },
    refreshButton: {
      position: 'absolute',
      left: 0,
      bottom: -2,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lastUpdatedContainer: {
      alignSelf: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginVertical: 4,
    },
    lastUpdatedContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    lastUpdatedText: {
      fontSize: 12,

    },
    summaryBox: {
      width: '48%',
      padding: 5,
      borderRadius: 8,
    },
    profitLossBox: {
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      // paddingVertical: 10,
    },
    hasBox: {
      backgroundColor: config.colors.hasBlockGreen,
    },
    wantsBox: {
      backgroundColor: config.colors.wantBlockRed,
    },
    priceValue: {
      color: 'white',
      textAlign: 'center',
      marginTop: 5,
      fontWeight: 'bold',
    },
    itemRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      width: '49%',
      alignItems: 'center',
      marginBottom: 5,
      borderColor: config.colors.primary,
      borderWidth: 2,
      marginHorizontal: 'auto',
      borderRadius: 4,
      overflow: 'hidden',
    },
    // Added specific style for favorite button in grid
    favoriteButton: {
      position: 'absolute',
      top: 5,
      right: 5,
      backgroundColor: isDarkMode ? '#1e1e1e' : config.colors.wantBlockRed,
      borderRadius: 12,
      padding: 4,
      zIndex: 10,
      borderWidth: 1,
      borderColor: config.colors.primary,
    },
    addItemBlockNew: {
      width: '33.33%',
      height: 60,
      backgroundColor: isDarkMode ? '#1e1e1e' : config.colors.wantBlockRed,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: config.colors.primary,
    },
    itemText: {
      color: isDarkMode ? 'white' : 'black',
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: 12
    },
    removeButton: {
      position: 'absolute',
      top: 2,
      right: 2,
      // backgroundColor: config.colors.wantBlockRed,
      borderRadius: 50,
      opacity: .7
    },
    divider: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: config.colors.primary,
      margin: 'auto',
      borderRadius: 12,
      padding: 5,
    },
    drawerContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: isDarkMode ? '#3B404C' : 'white',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      height: '80%',
      paddingTop: 16,
      paddingHorizontal: 16,
    },
    drawerContainer2: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: isDarkMode ? '#3B404C' : 'white',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      // height: '80%',
      paddingTop: 16,
      paddingHorizontal: 16,
    },
    drawerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    drawerContent: {
      flex: 1,
      flexDirection: 'row',
    },
    categoryListScroll: {
      maxWidth: '25%',
      width: '25%',
      paddingRight: 12,
    },
    categoryList: {
      paddingVertical: 2,
    },
    categoryButton: {
      marginVertical: 2,
      marginHorizontal: 4,
      paddingVertical: 8,
      paddingHorizontal: 6,
      backgroundColor: '#f0f0f0',
      borderRadius: 6,
      alignItems: 'center',
      minWidth: 40,
    },
    categoryButtonActive: {
      backgroundColor: '#FF9999',
    },
    categoryButtonText: {
      fontSize: 8,
      fontWeight: '600',
      color: '#666',
    },
    categoryButtonTextActive: {
      color: '#fff',
    },
    gridContainer: {
      flex: 1,
      flexShrink: 1,
      flex: 1,
      // paddingBottom: 60,
    },
    gridItem: {
      flex: 1,
      margin: 4,
      alignItems: 'center',
    },
    gridItemImage: {
      width: 60,
      height: 60,
      borderRadius: 10,
    },
    gridItemText: {
      fontSize: 11,
      marginTop: 4,
      color: isDarkMode ? '#fff' : '#333',
    },
    badgeContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: isDarkMode ? '#4A4A4A' : '#E0E0E0',
      // marginTop: 8,
    },
    badge: {
      color: 'white',
      padding: 0.5,
      borderRadius: 10,
      fontSize: 6,
      minWidth: 10,
      textAlign: 'center',
      overflow: 'hidden',
      fontWeight: '600',
    },
    badgeButton: {
      marginHorizontal: 4,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: isDarkMode ? '#2A2A2A' : '#f0f0f0',
    },
    badgeButtonActive: {
      backgroundColor: '#3498db',
    },
    badgeButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDarkMode ? '#fff' : '#666',
    },
    badgeButtonTextActive: {
      color: '#fff',
    },
    modalOverlay: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      flex: 1,
    },
    searchInput: {
      width: '75%',
      borderColor: '#333',
      borderWidth: 1,
      borderRadius: 5,
      height: 40,
      paddingHorizontal: 10,
      backgroundColor: '#fff',
      color: '#000',
    },
    closeButton: {
      backgroundColor: config.colors.wantBlockRed,
      padding: 10,
      borderRadius: 5,
      height: 40,

      width: '24%',
      alignItems: 'center',
      justifyContent: 'center'
    },
    closeButtonText: {
      color: 'white',
      textAlign: 'center',

      fontSize: 12
    },
    itemImageOverlay: {
      width: 40,
      height: 40,
      borderRadius: 5,
      resizeMode: 'contain',
    },
    screenshotView: {
      padding: 10,
      flex: 1,
    },


    createtrade: {
      alignSelf: 'center',
      justifyContent: 'center',
      flexDirection: 'row'
    },
    createtradeButton: {
      backgroundColor: config.colors.hasBlockGreen,
      alignSelf: 'center',
      padding: 10,
      justifyContent: 'center',
      flexDirection: 'row',
      minWidth: 120,
      borderTopStartRadius: 20,
      borderBottomStartRadius: 20,
      marginRight: 1
    },
    shareTradeButton: {
      backgroundColor: config.colors.wantBlockRed,
      alignSelf: 'center',
      padding: 10,
      flexDirection: 'row',
      justifyContent: 'center',
      minWidth: 120,
      borderTopEndRadius: 20,
      borderBottomEndRadius: 20,
      marginLeft: 1
    },
    modalMessage: {
      fontSize: 12,
      marginBottom: 4,
      color: isDarkMode ? 'white' : 'black',

    },
    modalMessagefooter: {
      fontSize: 10,
      marginBottom: 10,
      color: isDarkMode ? 'grey' : 'grey',

    },
    input: {
      width: '100%',
      height: 40,
      borderColor: 'gray',
      borderWidth: 1,
      borderRadius: 5,
      paddingHorizontal: 10,
      marginBottom: 20,
      color: isDarkMode ? 'white' : 'black',
      fontWeight: 'normal'
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      marginBottom: 10,
      paddingHorizontal: 20
    },
    button: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 5,
    },
    cancelButton: {
      backgroundColor: config.colors.wantBlockRed,
    },
    confirmButton: {
      backgroundColor: config.colors.hasBlockGreen,
    },
    buttonText: {
      color: 'white',
      fontSize: 14,
      fontWeight: 'bold',
    },

    text: {
      color: "white",
      fontSize: 12,

      lineHeight: 12
    },


    typeContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      marginBottom: 20,
      position: 'relative',
    },
    recommendedContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },
    recommendedText: {
      fontSize: 12,
      color: '#666',
      marginLeft: 4,
      fontWeight: '500',
    },
    curvedArrow: {
      transform: [{ rotate: '-90deg' }],
      marginRight: 2,
    },
    typeButtonsContainer: {
      flexDirection: 'row',
      backgroundColor: 'rgb(253, 229, 229)',
      borderRadius: 20,
      padding: 4,
    },
    typeButton: {
      paddingVertical: 8,
      paddingHorizontal: 20,
      borderRadius: 16,
    },
    typeButtonActive: {
      backgroundColor: config.colors.hasBlockGreen,
    },
    typeButtonText: {
      fontSize: 14,
      color: '#666',
      fontWeight: '500',
    },
    typeButtonTextActive: {
      color: 'white',
      fontWeight: '600',
    },
    valueText: {
      fontSize: 10,
      color: isDarkMode ? '#aaa' : '#666',
      marginTop: 2,
    },


    // ✅ Favorites row layout styles - matching ValueScreen.js (compact version)
    favoriteRowItem: {
      backgroundColor: isDarkMode ? '#1e1e1e' : '#ffffff',
      borderRadius: 6,
      marginHorizontal: 4,
      marginBottom: 4,
      padding: 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
      position: 'relative',
    },
    favoriteClickableArea: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 4,
    },
    favoriteImageContainer: {
      position: 'relative',
    },
    favoriteItemImage: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: isDarkMode ? '#2a2a2a' : '#f8f9fa',
    },
    favoriteItemInfo: {
      flex: 1,
      justifyContent: 'center',
    },
    favoriteItemName: {
      fontSize: 11,
      fontWeight: '700',
      color: isDarkMode ? '#ffffff' : '#000000',
      marginBottom: 1,
      letterSpacing: -0.3,
    },
    favoriteItemValue: {
      fontSize: 9,
      color: isDarkMode ? '#e0e0e0' : '#333333',
      marginBottom: 1,
      fontWeight: '500',
    },
    favoriteItemRarity: {
      fontSize: 8,
      color: config.colors.primary,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    favoriteBadgesContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 2,
      backgroundColor: isDarkMode ? '#2a2a2a' : '#f0f0f0',
      borderRadius: 8,
      padding: 4,
      marginTop: 2,
    },
    favoriteBadgeButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: isDarkMode ? '#3a3a3a' : '#ffffff',
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
      minWidth: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    favoriteBadgeButtonActive: {
      backgroundColor: config.colors.primary,
    },
    favoriteBadgeButtonText: {
      fontSize: 8,
      fontWeight: '600',
      color: isDarkMode ? '#ffffff' : '#666666',
      textAlign: 'center',
    },
    favoriteBadgeButtonTextActive: {
      color: '#ffffff',
    },
    favoriteDeleteButton: {
      position: 'absolute',
      top: 4,
      right: 4,
      padding: 2,
      zIndex: 10,
    },
    favoriteButton: {
      position: 'absolute',
      top: 5,
      right: 5,
      padding: 5,
      borderRadius: 50,
    },
    emptyFavoritesContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      marginTop: 50,
    },
    emptyFavoritesText: {
      fontSize: 16,
      color: isDarkMode ? '#fff' : '#666',
      marginTop: 10,
      marginBottom: 20,
    },
    addToFavoritesButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDarkMode ? '#2A2A2A' : '#f0f0f0',
      padding: 10,
      borderRadius: 8,
      margin: 10,
      width: '100%',
    },
    addToFavoritesText: {
      marginLeft: 8,
      fontSize: 10,
      color: isDarkMode ? '#fff' : '#666',
    },
    favoritesHeader: {
      padding: 10,
      alignItems: 'center',
    },
    favoritesTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkMode ? '#fff' : '#333',
    },
    createtradeAds: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    removeAdsButton: {
      borderRadius: 999,
      paddingVertical: 5,
      paddingHorizontal: 10,
      backgroundColor: '#fbbf24', // warm gold
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
      // minWidth:244
      marginTop: 20

    },

    removeAdsContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },

    crownWrapper: {
      width: 25,
      height: 25,
      borderRadius: 12,
      backgroundColor: '#fde68a',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
    },

    removeAdsTextWrapper: {
      flexDirection: 'column',
    },

    removeAdsTitle: {
      color: '#1f2933',
      fontSize: 12,
      fontWeight: 'bold',
    },

    removeAdsSubtitle: {
      color: '#374151',
      fontSize: 10,

      opacity: 0.9,
    },

  });

export default HomeScreen;