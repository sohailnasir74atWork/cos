import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  FlatList,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { debounce } from '../Helper/debounce';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import config from '../Helper/Environment';
import { useGlobalState } from '../GlobelStats';
import CodesDrawer from './Code';
import { useHaptic } from '../Helper/HepticFeedBack';
import { useLocalState } from '../LocalGlobelStats';

import { ref, update } from '@react-native-firebase/database';

import { Menu, MenuOption, MenuOptions, MenuTrigger } from 'react-native-popup-menu';
import InterstitialAdManager from '../Ads/IntAd';
import BannerAdComponent from '../Ads/bannerAds';
import { handleBloxFruit, handleadoptme } from '../SettingScreen/settinghelper';
import { showSuccessMessage, showErrorMessage } from '../Helper/MessageHelper';


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



const ItemBadge = React.memo(({ type, style, styles }) => (
  <Text style={[styles.itemBadge, style]}>{type}</Text>
));

const ItemImage = React.memo(({ uri, badges, styles }) => (
  <View style={styles.imageWrapper}>
    <Image source={{ uri }} style={styles.icon} resizeMode="cover" />
    <View style={styles.itemBadgesContainer}>
      {badges}
    </View>
  </View>
));



const ValueScreen = React.memo(({ selectedTheme, fromChat, selectedFruits, setSelectedFruits, onRequestClose, fromSetting, ownedPets, setOwnedPets, wishlistPets, setWishlistPets, owned }) => {
  const [searchText, setSearchText] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');

  const [filterDropdownVisible, setFilterDropdownVisible] = useState(false);
  const { analytics, appdatabase, isAdmin, reload, theme } = useGlobalState()
  const isDarkMode = theme === 'dark'
  const styles = useMemo(() => getStyles(isDarkMode), [isDarkMode]);
  const { localState, toggleAd } = useLocalState()
  const [valuesData, setValuesData] = useState([]);
  const [codesData, setCodesData] = useState([]);

  const [filters, setFilters] = useState(['All']);
  const displayedFilter = selectedFilter === 'PREMIUM' ? 'GAME PASS' : selectedFilter;
  const formatName = (name) => name.replace(/^\+/, '').replace(/\s+/g, '-');
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [hasAdBeenShown, setHasAdBeenShown] = useState(false);
  const [isAdLoaded, setIsAdLoaded] = useState(false);
  const [isShowingAd, setIsShowingAd] = useState(false);
  const { triggerHapticFeedback } = useHaptic();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [itemSelections, setItemSelections] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showAd1, setShowAd1] = useState(localState?.showAd1);
  const [sortOrder, setSortOrder] = useState('none'); // 'asc', 'desc', or 'none'

  // ✅ Add refs to track mounted state and debounce cleanup
  const isMountedRef = useRef(true);
  const debounceTimeoutRef = useRef(null);


  // ✅ Memoize categories to prevent recreation
  // ✅ Dynamic Categories
  const CATEGORIES = useMemo(() => {
    // Standard static categories
    const staticCats = ['ALL'];

    // Extract unique types from data
    const dynamicTypes = (parsedValuesData || [])
      .map(item => item?.type)
      .filter(Boolean)
      .map(type => type.toString())
      .filter((value, index, self) => self.indexOf(value) === index);

    dynamicTypes.sort();

    const filteredDynamic = dynamicTypes.filter(t =>
      !['ALL'].includes(t.toUpperCase())
    );

    return [...staticCats, ...filteredDynamic];
  }, [parsedValuesData]);

  // console.log(selectedFruits)

  const ListItem = React.memo(({ item, itemSelection, onBadgePress, getItemValue, styles, onPress }) => {
    const currentValue = getItemValue(item);

    // Group tags by category for cleaner display
    const groupedTags = useMemo(() => {
      const groups = {};
      item.tags?.forEach(tagObj => {
        const cat = tagObj.category || 'Other';
        const formattedCat = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
        if (!groups[formattedCat]) groups[formattedCat] = [];
        groups[formattedCat].push(tagObj.tag);
      });
      return groups;
    }, [item.tags]);

    return (
      <TouchableOpacity style={[styles.itemContainer]} onPress={onPress} disabled={!fromChat && !fromSetting}>
        <View style={styles.cardHeader}>
          <ItemImage
            uri={getImageUrl(item)}
            badges={null}
            styles={styles}
          />
          <View style={styles.headerInfo}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <View style={styles.valueContainer}>
              <Text style={styles.valueLabel}>Value</Text>
              <Text style={styles.value}>{formatCompactNumber(currentValue)}</Text>
            </View>
            {item.type && (() => {
              const colors = config.getTagColor('type', isDarkMode);
              return (
                <View style={[styles.tagBadge, { backgroundColor: colors.bg, borderColor: colors.border, alignSelf: 'flex-start', marginTop: 4, paddingVertical: 2, paddingHorizontal: 6 }]}>
                  <Text style={[styles.tagText, { color: colors.text, fontSize: 10 }]}>{item.type.toUpperCase()}</Text>
                </View>
              );
            })()}
          </View>
        </View>

        <View style={styles.divider} />

        {/* ✅ Hide details in selection mode */}
        {!fromChat && !fromSetting && (
          <View style={styles.tagsContainer}>
            {/* Primary Tags (Rarity) */}
            <View style={styles.tagRow}>
              {item.rarity && (() => {
                const colors = config.getTagColor('rarity', isDarkMode);
                return (
                  <View style={[styles.tagBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                    <Text style={[styles.tagText, { color: colors.text }]}>RARITY: {item.rarity.toUpperCase()}</Text>
                  </View>
                );
              })()}
            </View>

            {/* Grouped Dynamic Tags */}
            <View style={{ gap: 8 }}>
              {Object.entries(groupedTags).map(([category, tags], idx) => {
                const colors = config.getTagColor(category, isDarkMode);
                return (
                  <View key={`${category}-${idx}`} style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4 }}>
                    <Text style={[styles.tagText, { color: colors.text, fontWeight: '800', marginRight: 4 }]}>
                      {category}:
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                      {tags.map((tag, tIdx) => (
                        <View key={`${tag}-${tIdx}`} style={[styles.tagBadge, { backgroundColor: colors.bg, borderColor: colors.border, paddingVertical: 2, paddingHorizontal: 6 }]}>
                          <Text style={[styles.tagText, { color: colors.text, fontSize: 10 }]}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  });

  const editValuesRef = useRef({
    Value: '',
    Permanent: '',
    Biliprice: '',
    Robuxprice: '',
  });
  // ✅ Cleanup on unmount - Fixed: Use ref to track if ad was toggled to prevent infinite loop
  const hasToggledAdRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    // ✅ Only toggle ad once on mount, not on every render
    if (!hasToggledAdRef.current) {
      hasToggledAdRef.current = true;
      const newAdState = toggleAd();
      if (isMountedRef.current) {
        setShowAd1(newAdState);
      }
    }

    return () => {
      isMountedRef.current = false;
      // ✅ Cleanup debounce timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, []); // ✅ Empty deps - only run once on mount, toggleAd is stable
  const CustomAd = () => (
    <View style={styles.adContainer}>
      <View style={styles.adContent}>
        <Image
          source={require('../../assets/icon.webp')} // Replace with your ad icon
          style={styles.adIcon}
        />
        <View>
          <Text style={styles.adTitle}>Blox Fruits Values</Text>
          <Text style={styles.tryNowText}>Try Our other app</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.downloadButton} onPress={() => {
        handleBloxFruit(); triggerHapticFeedback('impactLight');
      }}>
        <Text style={styles.downloadButtonText}>Download</Text>
      </TouchableOpacity>
    </View>
  );

  const CustomAd2 = () => (
    <View style={styles.adContainer}>
      <View style={styles.adContent}>
        <Image
          source={require('../../assets/MM2logo.webp')}
          style={styles.adIcon}
        />
        <View>
          <Text style={styles.adTitle}>MM2 Values</Text>
          <Text style={styles.tryNowText}>Try Our other app</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.downloadButton} onPress={() => {
        handleadoptme(); triggerHapticFeedback('impactLight');
      }}>
        <Text style={styles.downloadButtonText}>Download</Text>
      </TouchableOpacity>
    </View>
  );


  // Memoize the parsed data to prevent unnecessary re-parsing
  // Memoize the parsed data to prevent unnecessary re-parsing
  const parsedValuesData = useMemo(() => {
    try {
      // Always use standard data for CoS
      const rawData = localState.data;
      if (!rawData) return [];

      const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      return typeof parsed === 'object' && parsed !== null ? Object.values(parsed) : [];
    } catch (error) {
      console.error("❌ Error parsing data:", error);
      return [];
    }
  }, [localState.data]);

  const getImageUrl = (item) => {
    if (!item) return '';
    return item.image || '';
  };
  // Memoize the parsed codes data
  const parsedCodesData = useMemo(() => {
    if (!localState.codes) return [];
    try {
      const parsed = typeof localState.codes === 'string' ? JSON.parse(localState.codes) : localState.codes;
      return typeof parsed === 'object' && parsed !== null ? Object.values(parsed) : [];
    } catch (error) {
      console.error("❌ Error parsing codes:", error);
      return [];
    }
  }, [localState.codes]);

  // Memoize the filters
  const availableFilters = useMemo(() => {
    // Only use derived CATEGORIES (which already includes dynamic types)
    return CATEGORIES;
  }, [CATEGORIES]);

  // Optimize the search and filter logic

  // useEffect(() => {
  //   if (localState.isGG) {
  //     const types = new Set(parsedValuesData.map(i => (i.type || '').toUpperCase()));
  //     // console.log("🧪 GG Types:", Array.from(types));
  //   }
  // }, [parsedValuesData]);


  // Optimize the getItemValue function
  const getItemValue = useCallback((item) => {
    if (!item) return 0;
    // Use avgValue as primary, fallback to guideValue or 0
    return Number(item.avgValue || item.guideValue || 0).toFixed(0); // Display as integer mainly for sorting/raw value
  }, []);
  const filteredData = useMemo(() => {
    if (!Array.isArray(parsedValuesData) || parsedValuesData.length === 0) return [];

    const searchLower = searchText.toLowerCase();
    const filterUpper = selectedFilter.toUpperCase();

    let filtered = parsedValuesData.filter((item) => {
      if (!item?.name) return false;

      const matchesSearch = item.name.toLowerCase().includes(searchLower);

      let matchesFilter = false;
      if (filterUpper === 'ALL') {
        matchesFilter = true;
      } else {
        // Exact match type against filter
        matchesFilter = item.type?.toUpperCase() === filterUpper;
      }

      return matchesSearch && matchesFilter;
    });

    // Apply sort
    if (sortOrder !== 'none') {
      filtered.sort((a, b) => {
        const aValue = parseFloat(getItemValue(a));
        const bValue = parseFloat(getItemValue(b));
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      });
    }

    return filtered;
  }, [parsedValuesData, searchText, selectedFilter, sortOrder, getItemValue]);




  // 👇 Add these inside ValueScreen, after your other hooks/useState
  const selectedList = useMemo(() => {
    if (fromChat) {
      return selectedFruits || [];
    }
    if (fromSetting) {
      return owned ? (ownedPets || []) : (wishlistPets || []);
    }
    return [];
  }, [fromChat, fromSetting, owned, selectedFruits, ownedPets, wishlistPets]);

  const handleRemoveSelected = useCallback(
    (index) => {
      if (fromChat) {
        setSelectedFruits?.((prev = []) => prev.filter((_, i) => i !== index));
      } else if (fromSetting) {
        if (owned) {
          setOwnedPets?.((prev = []) => prev.filter((_, i) => i !== index));
        } else {
          setWishlistPets?.((prev = []) => prev.filter((_, i) => i !== index));
        }
      }
    },
    [fromChat, fromSetting, owned, setSelectedFruits, setOwnedPets, setWishlistPets]
  );


  // Optimize the renderItem function
  // Optimize the renderItem function
  const renderItem = useCallback(
    ({ item }) => {
      // value based on current badges
      const currentValue = getItemValue(item);

      // image url for this item
      const imageUrl = getImageUrl(
        item,
        localState.isGG,
        localState.imgurl,
        localState.imgurlGG
      );

      const handlePress = () => {
        if (!isMountedRef.current) return;

        const fruitObj = {
          Name: item.Name ?? item.name,
          name: item.name,
          value: Number(currentValue),
          category: item.type,
          id: item.id,
          imageUrl,
        };

        // 👉 From chat: always add another copy
        if (fromChat && setSelectedFruits) {
          setSelectedFruits(prev => [...(prev || []), fruitObj]);
        }

        // 👉 From settings: always add another copy
        if (fromSetting) {
          if (owned && setOwnedPets) {
            setOwnedPets(prev => [...(prev || []), fruitObj]);
          } else if (setWishlistPets) {
            setWishlistPets(prev => [...(prev || []), fruitObj]);
          }
        }
      };

      return (
        <ListItem
          item={item}
          getItemValue={getItemValue}
          styles={styles}
          onPress={handlePress}
        />
      );
    },
    [
      getItemValue,
      styles,
      localState.isGG,
      localState.imgurl,
      localState.imgurlGG,
      fromChat,
      fromSetting,
      owned,
      setSelectedFruits,
      setOwnedPets,
      setWishlistPets
    ]
  );


  // Update the useEffect for values data
  useEffect(() => {
    if (!isMountedRef.current) return;
    setValuesData(parsedValuesData);
    setFilters(availableFilters);
  }, [parsedValuesData, availableFilters]);

  // Update the useEffect for codes data
  useEffect(() => {
    if (!isMountedRef.current) return;
    setCodesData(parsedCodesData);
  }, [parsedCodesData]);

  const handleRefresh = useCallback(async () => {
    if (!isMountedRef.current) return;

    setRefreshing(true);

    try {
      await reload(); // Re-fetch stock data
      if (!isMountedRef.current) return;
      // ✅ Show success message when values are reloaded
      showSuccessMessage('Success', 'Values have been reloaded');
    } catch (error) {
      console.error('Error refreshing data:', error);
      if (!isMountedRef.current) return;
      showErrorMessage('Error', 'Failed to reload values. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [reload]);

  const toggleDrawer = useCallback(() => {
    if (!isMountedRef.current) return;

    triggerHapticFeedback('impactLight');
    const callbackfunction = () => {
      if (!isMountedRef.current) return;
      setHasAdBeenShown(true); // Mark the ad as shown
      setIsDrawerVisible(prev => !prev);
    };

    if (!hasAdBeenShown && !localState.isPro) {
      InterstitialAdManager.showAd(callbackfunction);
    }
    else {
      if (isMountedRef.current) {
        setIsDrawerVisible(prev => !prev);
      }
    }

  }, [triggerHapticFeedback, hasAdBeenShown, localState.isPro]); // ✅ Removed isDrawerVisible - using functional update


  const applyFilter = (filter) => {
    setSelectedFilter(filter);
  };

  // ✅ Memoize debounced search with cleanup
  const handleSearchChange = useCallback((text) => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout
    debounceTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setSearchText(text);
      }
      debounceTimeoutRef.current = null;
    }, 300);
  }, []);
  const closeDrawer = () => {
    setFilterDropdownVisible(false);
  };





  return (
    <>
      <GestureHandlerRootView>
        <View style={styles.container}>
          {(fromChat || fromSetting) && selectedList?.length > 0 && (
            <View style={styles.selectedPetsSection}>
              <View style={styles.selectedPetsHeader}>
                <Text style={styles.selectedPetsTitle}>
                  {fromChat
                    ? 'Selected pets'
                    : owned
                      ? 'Owned pets'
                      : 'Wishlist'}
                </Text>

                <Text style={styles.selectedPetsCount}>
                  {selectedList.length}
                </Text>
              </View>

              <FlatList
                horizontal
                data={selectedList}
                keyExtractor={(item, index) => `${item.id || item.name}-${index}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectedPetsList}
                renderItem={({ item, index }) => (
                  <TouchableOpacity style={styles.selectedPetCard} onPress={() => handleRemoveSelected(index)}>
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.selectedPetImage}
                    />
                    <Text
                      style={styles.selectedPetName}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>

                    <View
                      style={styles.removePetButton}

                    >
                      <Icon name="close" size={8} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
          {/* {(!fromChat && !fromSetting) && (
  showAd1 ? <CustomAd /> : <CustomAd2 />
)} */}

          <View style={styles.searchFilterContainer}>

            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="#888"
              onChangeText={handleSearchChange}
            />
            {/* Selected / owned pets strip (chat/settings only) */}


            {!fromChat && !fromSetting && <Menu>
              <MenuTrigger onPress={() => { }}>
                <View style={styles.filterButton}>
                  <Text style={styles.filterText}>{displayedFilter}</Text>
                  <Icon name="chevron-down-outline" size={18} color="white" />
                </View>
              </MenuTrigger>
              <MenuOptions customStyles={{ optionsContainer: styles.menuOptions }}>
                {filters.map((filter) => (
                  <MenuOption
                    key={filter}
                    onSelect={() => applyFilter(filter)}
                  >
                    <Text style={[styles.filterOptionText, selectedFilter === filter && styles.selectedOption]}>
                      {filter}
                    </Text>
                  </MenuOption>
                ))}
              </MenuOptions>

            </Menu>}
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => {
                setSortOrder(prev =>
                  prev === 'asc' ? 'desc' : prev === 'desc' ? 'none' : 'asc'
                );
              }}
            >
              <Text style={styles.filterText}>
                {sortOrder === 'asc' ? '▲ High' : sortOrder === 'desc' ? '▼ LOw' : 'Filter'}
              </Text>
            </TouchableOpacity>
            {!fromChat && !fromSetting && (
              <TouchableOpacity
                style={styles.filterButton}
                onPress={() => {
                  triggerHapticFeedback('impactLight');
                  handleRefresh();
                }}
                disabled={refreshing}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon name="refresh" size={18} color="white" />
                )}
              </TouchableOpacity>
            )}
            {selectedFruits?.length > 0 && <TouchableOpacity
              style={[styles.filterButton, { backgroundColor: 'purple' }]}
              onPress={onRequestClose}
            >
              <Text style={styles.filterText}>
                Done
              </Text>
            </TouchableOpacity>}
          </View>

          {filteredData.length > 0 ? (
            <FlatList
              data={filteredData}
              keyExtractor={(item) => item.id || item.name}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              numColumns={1}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              maxToRenderPerBatch={10}
              windowSize={5}
              initialNumToRender={10}
            />
          ) : (
            <Text style={[styles.description, { textAlign: 'center', marginTop: 20, color: 'gray' }]}>
              No items match your search criteria.
            </Text>
          )}
        </View>
        <CodesDrawer isVisible={isDrawerVisible} toggleModal={toggleDrawer} codes={codesData} />
      </GestureHandlerRootView>
      {!localState.isPro && !fromChat && <BannerAdComponent />}
    </>
  );
});
export const getStyles = (isDarkMode) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDarkMode ? '#121212' : '#f8f9fa',
    // paddingTop: 16,
  },
  searchFilterContainer: {
    flexDirection: 'row',
    marginVertical: 8,
    paddingHorizontal: 8,
    gap: 4,
    alignItems: 'center',
  },
  searchInput: {
    height: 48, // Taller input
    backgroundColor: isDarkMode ? '#2a2a2a' : '#ffffff',
    borderRadius: 12, // Rounder
    paddingHorizontal: 20,
    color: isDarkMode ? '#ffffff' : '#000000',
    flex: 1,
    fontSize: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },

  itemContainer: {
    backgroundColor: isDarkMode ? '#1e1e1e' : '#ffffff',
    borderRadius: 16,
    marginBottom: 16,
    width: '94%',
    alignSelf: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 }, // Deeper shadow
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: isDarkMode ? '#333' : '#eee', // Subtle border
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  imageWrapper: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: isDarkMode ? '#2c2c2c' : '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDarkMode ? '#444' : '#e0e0e0',
  },
  icon: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  name: {
    fontSize: 20,
    fontWeight: '800', // Bolder
    color: isDarkMode ? '#fff' : '#1a1a1a',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valueLabel: {
    fontSize: 11,
    color: isDarkMode ? '#888' : '#757575',
    fontWeight: '700',
    // textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 11,
    fontWeight: '900',
    color: config.colors.hasBlockGreen || '#2ecc71',
  },
  divider: {
    height: 1,
    backgroundColor: isDarkMode ? '#333' : '#f0f0f0',
    width: '100%',
  },
  tagsContainer: {
    padding: 12,
    paddingTop: 12,
    gap: 12,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    backgroundColor: isDarkMode ? '#2a2a2a' : '#f0f0f0',
    borderRadius: 16,
    marginTop: 8,
  },
  badgeButton: {
    paddingVertical: 7,
    paddingHorizontal: 15,
    borderRadius: 15,
    backgroundColor: isDarkMode ? '#3a3a3a' : '#ffffff',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  badgeButtonActive: {
    backgroundColor: config.colors.primary,
  },
  badgeButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: isDarkMode ? '#ffffff' : '#666666',
    textAlign: 'center',
  },
  badgeButtonTextActive: {
    color: '#ffffff',
  },
  filterText: {
    color: "white",
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,

  },
  filterOptionText: {
    fontSize: 14,
    padding: 10,
    color: isDarkMode ? '#fff' : '#333',
  },
  selectedOption: {
    fontWeight: '700',
    color: config.colors.primary,
  },
  menuOptions: {
    backgroundColor: isDarkMode ? '#2a2a2a' : '#ffffff',
    borderRadius: 16,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
    color: isDarkMode ? '#888888' : '#666666',
    fontWeight: '500',
  },
  modalContainer: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignSelf: 'center', // Centers the modal horizontally
    position: 'absolute',
    top: '50%', // Moves modal halfway down the screen
    left: '10%', // Centers horizontally considering width: '80%'
    transform: [{ translateY: -150 }], // Adjusts for perfect vertical centering
    justifyContent: 'center',
    elevation: 5, // Adds a shadow on Android
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Lato-Bold',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    marginVertical: 5,
    borderRadius: 5,
  },
  saveButton: {
    backgroundColor: "#2ecc71",
    paddingVertical: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  cencelButton: {
    backgroundColor: "red",
    paddingVertical: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  headertext: {
    backgroundColor: 'rgb(255, 102, 102)',
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 5,
    color: 'white',
    fontSize: 10,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: "flex-start",
    marginRight: 10

  },
  pointsBox: {
    width: '49%', // Ensures even spacing
    backgroundColor: isDarkMode ? '#34495E' : '#f3d0c7', // Dark: darker contrast, Light: White
    borderRadius: 8,
    padding: 10,
  },
  rowcenter: {
    flexDirection: 'row',
    alignItems: 'center',
    fontSize: 12,
    marginTop: 5,

  },
  menuContainer: {
    alignSelf: "center",
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: config.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    // paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  filterText: {
    color: "white",
    fontSize: 14,
    fontFamily: 'Lato-Bold',
    marginRight: 5,
  },
  // filterOptionText: {
  //   fontSize: 14,
  //   padding: 10,
  //   color: "#333",
  // },
  selectedOption: {
    fontFamily: 'Lato-Bold',
    color: "#34C759",
  },

  categoryBar: {
    marginBottom: 8,
    paddingVertical: 4,
    backgroundColor: isDarkMode ? '#181c22' : '#f8f9fa',
  },
  categoryBarContent: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  categoryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: isDarkMode ? '#23272f' : '#f0f0f0',
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: config.colors.primary,
  },
  categoryButtonText: {
    fontSize: 13,
    color: isDarkMode ? '#bbb' : '#333',
    fontWeight: '600',
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  adContainer: {
    // backgroundColor: '#F5F5F5', // Light background color for the ad
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    marginHorizontal: 10

  },
  adContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start', // Aligns text and image in a row
  },
  adIcon: {
    width: 50,
    height: 50,
    borderRadius: 5,
    marginRight: 15,
  },
  adTitle: {
    fontSize: 18,
    fontFamily: 'Lato-Bold',
    color: isDarkMode ? '#bbb' : '#333',
    // marginBottom: 5, // Adds space below the title
  },
  tryNowText: {
    fontSize: 14,
    fontFamily: 'Lato-Regular',
    color: '#6A5ACD', // Adds a distinct color for the "Try Now" text
    // marginTop: 5, // Adds space between the title and the "Try Now" text
  },
  downloadButton: {
    backgroundColor: '#34C759',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginTop: 10, // Adds spacing between the text and the button
  },
  downloadButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Lato-Bold',
  },
  selectedPetsSection: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  selectedPetsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  selectedPetsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: isDarkMode ? '#ffffff' : '#111827',
  },
  selectedPetsCount: {
    fontSize: 11,
    fontWeight: '600',
    color: isDarkMode ? '#9ca3af' : '#6b7280',
  },
  selectedPetsList: {
    paddingVertical: 4,
  },
  selectedPetCard: {
    width: 40,
    marginRight: 8,
    borderRadius: 10,
    padding: 6,
    backgroundColor: isDarkMode ? '#1f2933' : '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  selectedPetImage: {
    width: '100%',
    height: 15,
    borderRadius: 8,
    marginBottom: 1,
    backgroundColor: isDarkMode ? '#111827' : '#f3f4f6',
  },
  selectedPetName: {
    fontSize: 8,
    fontWeight: '500',
    color: isDarkMode ? '#e5e7eb' : '#111827',
  },
  removePetButton: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },

});

export default ValueScreen;
