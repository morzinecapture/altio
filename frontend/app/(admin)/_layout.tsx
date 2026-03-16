import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../../src/theme';

export default function AdminTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.purple,
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F1F5F9',
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 25,
          paddingTop: 10,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
        },
        tabBarLabelStyle: {
          fontFamily: 'PlusJakartaSans_500Medium',
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="overview"
        options={{
          title: 'Vue d\'ensemble',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: 'Utilisateurs',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="emergencies"
        options={{
          title: 'Urgences',
          tabBarIcon: ({ color, size }) => <Ionicons name="warning-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="finances"
        options={{
          title: 'Finances',
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Paramètres',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
      {/* Écrans sans tab */}
      <Tabs.Screen name="user/[id]"      options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="partners"       options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="partner-form"   options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}
