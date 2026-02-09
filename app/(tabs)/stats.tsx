import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { loadTasks } from '@/lib/storage';
import { computeStats, StatsResult } from '@/lib/statsUtils';

export default function StatsScreen() {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);

      async function refresh() {
        const tasks = await loadTasks();
        if (!mounted) return;
        setStats(computeStats(tasks, new Date()));
        setLoading(false);
      }

      refresh();
      return () => {
        mounted = false;
      };
    }, [])
  );

  if (loading || !stats) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Statistics</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Statistics</Text>
        <Text style={styles.subtitle}>Your progress at a glance</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={true}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today</Text>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{stats.completedToday}</Text>
            <Text style={styles.cardLabel}>Completed today</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{stats.incompleteToday}</Text>
            <Text style={styles.cardLabel}>Remaining today</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This week</Text>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{stats.completedThisWeek}</Text>
            <Text style={styles.cardLabel}>Completed this week</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overall</Text>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{stats.completedTotal}</Text>
            <Text style={styles.cardLabel}>Total completed</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{stats.incompleteTotal}</Text>
            <Text style={styles.cardLabel}>Incomplete tasks</Text>
          </View>
          {stats.overdueCount > 0 && (
            <View style={[styles.card, styles.cardOverdue]}>
              <Text style={styles.cardValue}>{stats.overdueCount}</Text>
              <Text style={styles.cardLabel}>Overdue</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#000',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginTop: 4,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  cardOverdue: {
    backgroundColor: '#fff5f5',
  },
  cardValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
  },
  cardLabel: {
    fontSize: 15,
    color: '#666',
    marginTop: 2,
  },
});
