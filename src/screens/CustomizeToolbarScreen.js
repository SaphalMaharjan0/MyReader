import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants/theme';
import { getToolbarConfig, saveToolbarConfig } from '../utils/toolbarStore';

export default function CustomizeToolbarScreen({ navigation, route }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      const config = await getToolbarConfig();
      setData(config);
    };
    loadData();
  }, []);

  const toggleEnabled = (id) => {
    if (id === 'customize') return;
    setData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
    );
  };

  const moveUp = (index) => {
    if (index === 0) return;
    const newData = [...data];
    const temp = newData[index - 1];
    newData[index - 1] = newData[index];
    newData[index] = temp;
    setData(newData);
  };

  const moveDown = (index) => {
    if (index === data.length - 1) return;
    const newData = [...data];
    const temp = newData[index + 1];
    newData[index + 1] = newData[index];
    newData[index] = temp;
    setData(newData);
  };

  const handleSave = async () => {
    await saveToolbarConfig(data);
    if (route.params?.onSave) {
      route.params.onSave(data);
    }
    navigation.goBack();
  };

  const renderItem = ({ item, index }) => {
    const isCustomize = item.id === 'customize';
    return (
      <View style={[styles.rowItem, isCustomize && { opacity: 0.8 }]}>
        <Switch
          value={isCustomize ? true : item.enabled}
          onValueChange={() => toggleEnabled(item.id)}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={isCustomize ? COLORS.darkCard : COLORS.card}
          disabled={isCustomize}
        />
        <Ionicons name={item.icon} size={24} color={COLORS.text} style={styles.icon} />
        <Text style={styles.itemName}>{item.name} {isCustomize && '(Required)'}</Text>
        
        <View style={styles.reorderButtons}>
          <TouchableOpacity 
            onPress={() => moveUp(index)} 
            style={styles.arrowButton}
            disabled={index === 0}
          >
            <Ionicons name="chevron-up" size={28} color={index === 0 ? COLORS.darkCard : COLORS.textLight} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => moveDown(index)} 
            style={styles.arrowButton}
            disabled={index === data.length - 1}
          >
            <Ionicons name="chevron-down" size={28} color={index === data.length - 1 ? COLORS.darkCard : COLORS.textLight} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Customize Reader Bar</Text>
      </View>
      
      <View style={styles.listWrapper}>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.buttonCancel} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonTextCancel}>CANCEL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonOk} onPress={handleSave}>
          <Text style={styles.buttonTextOk}>OK</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkBackground,
  },
  header: {
    padding: SIZES.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.darkCard,
  },
  headerTitle: {
    fontSize: SIZES.large,
    fontWeight: 'bold',
    color: COLORS.darkText,
  },
  listWrapper: {
    flex: 1,
  },
  listContainer: {
    paddingVertical: SIZES.small,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SIZES.medium,
    backgroundColor: COLORS.darkBackground,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  icon: {
    marginLeft: SIZES.medium,
    marginRight: SIZES.small,
    color: COLORS.darkText,
  },
  itemName: {
    flex: 1,
    fontSize: SIZES.medium,
    color: COLORS.darkText,
  },
  reorderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowButton: {
    padding: 4,
    marginLeft: 8,
  },
  footer: {
    flexDirection: 'row',
    padding: SIZES.medium,
    borderTopWidth: 1,
    borderTopColor: COLORS.darkCard,
    backgroundColor: COLORS.darkBackground,
  },
  buttonCancel: {
    flex: 1,
    alignItems: 'center',
    padding: SIZES.small,
  },
  buttonTextCancel: {
    color: COLORS.darkText,
    fontSize: SIZES.medium,
    fontWeight: '600',
  },
  buttonOk: {
    flex: 1,
    alignItems: 'center',
    padding: SIZES.small,
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.base,
  },
  buttonTextOk: {
    color: COLORS.card,
    fontSize: SIZES.medium,
    fontWeight: '600',
  },
});
