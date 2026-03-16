import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  SafeAreaView,
  TouchableOpacity
} from 'react-native-web';

const { width, height } = Dimensions.get('window');

// Holographic Theme Colors
const theme = {
  bg: '#020617', // Very dark slate/blue
  neonPrimary: '#00f3ff', // Cyan
  neonSecondary: '#bd00ff', // Purple
  neonAlert: '#ff0055', // Red/Pink
  textMain: '#e2f8ff',
  textMuted: '#4a828f',
  glowOpacity: 0.15,
};

// --- Reusable Holographic Components ---

const GlowingText = ({ style, children, color = theme.neonPrimary, size = 16, blink = false }: any) => {
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (blink) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacityAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      opacityAnim.setValue(1);
    }
  }, [blink]);

  return (
    <Animated.Text
      style={[
        styles.baseText,
        {
          color: color,
          fontSize: size,
          textShadow: `0px 0px 8px ${color}`,
          opacity: opacityAnim,
        },
        style,
      ] as any}
    >
      {children}
    </Animated.Text>
  );
};

const HoloPanel = ({ title, children, style, flex, borderColor = theme.neonPrimary }: any) => {
  return (
    <View style={[styles.panel, { flex, borderColor, boxShadow: `0px 0px 10px ${borderColor}` }, style] as any}>
      <View style={styles.panelHeader}>
        <GlowingText size={12} color={borderColor} style={{ letterSpacing: 2 }}>
          {title.toUpperCase()}
        </GlowingText>
        <View style={[styles.panelCornerTopRight, { borderColor }]} />
        <View style={[styles.panelCornerBottomLeft, { borderColor }]} />
      </View>
      <View style={styles.panelContent}>{children}</View>
    </View>
  );
};

// --- Dashboard Widgets ---

const CpuWidget = () => {
  const [bars, setBars] = useState(Array.from({ length: 12 }, () => Math.random() * 100));

  useEffect(() => {
    const interval = setInterval(() => {
      setBars(prev => {
        const newBars = [...prev.slice(1), Math.random() * 100];
        return newBars;
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <HoloPanel title="Core Processing" flex={1}>
      <View style={styles.chartContainer}>
        {bars.map((val, idx) => (
          <View key={idx} style={styles.barWrapper}>
            <View
              style={[
                styles.bar,
                { height: `${val}%`, backgroundColor: val > 80 ? theme.neonAlert : theme.neonPrimary },
                val > 80 && { boxShadow: `0px 0px 5px ${theme.neonAlert}` }
              ] as any}
            />
          </View>
        ))}
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.mutedText}>LOAD: {Math.round(bars[bars.length - 1])}%</Text>
        <GlowingText color={bars[bars.length - 1] > 80 ? theme.neonAlert : theme.neonPrimary} size={12}>
          {bars[bars.length - 1] > 80 ? 'CRITICAL' : 'OPTIMAL'}
        </GlowingText>
      </View>
    </HoloPanel>
  );
};

const NetworkWidget = () => {
  const [uplink, setUplink] = useState(0);
  const [downlink, setDownlink] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setUplink(Math.floor(Math.random() * 500) + 100);
      setDownlink(Math.floor(Math.random() * 1500) + 500);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <HoloPanel title="Network Uplink" flex={1} borderColor={theme.neonSecondary}>
      <View style={{ flex: 1, justifyContent: 'space-around' }}>
        <View>
          <Text style={styles.mutedText}>DOWNLINK STREAM</Text>
          <GlowingText color={theme.neonSecondary} size={24}>{downlink} TB/s</GlowingText>
          <View style={[styles.miniBar, { width: `${(downlink / 2000) * 100}%`, backgroundColor: theme.neonSecondary }]} />
        </View>
        <View>
          <Text style={styles.mutedText}>UPLINK STREAM</Text>
          <GlowingText color={theme.neonSecondary} size={24}>{uplink} TB/s</GlowingText>
          <View style={[styles.miniBar, { width: `${(uplink / 1000) * 100}%`, backgroundColor: theme.neonSecondary }]} />
        </View>
      </View>
    </HoloPanel>
  );
};

const SystemLogWidget = () => {
  const [logs, setLogs] = useState(['INIT SEQUENCE... OK']);
  const logMessages = [
    'CONNECTING TO ORBITAL RELAY...',
    'ENCRYPTING DATASTREAM...',
    'AUTH BYPASS SUCCESSFUL.',
    'WARNING: UNKNOWN ENTITY DETECTED.',
    'REROUTING POWER TO SHIELDS.',
    'DOWNLOADING SCHEMATICS...',
    'SYNCING QUANTUM CLOCKS...',
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      const newLog = logMessages[Math.floor(Math.random() * logMessages.length)] + ` [${Math.random().toString(16).substr(2, 4).toUpperCase()}]`;
      setLogs(prev => {
        const next = [newLog, ...prev];
        if (next.length > 6) return next.slice(0, 6);
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <HoloPanel title="System Term" style={{ height: 180 }}>
      {logs.map((log, i) => (
        <Text key={i} style={[
          styles.logText,
          { opacity: 1 - (i * 0.15) },
          log.includes('WARNING') && { color: theme.neonAlert, textShadow: `0px 0px 4px ${theme.neonAlert}` }
        ] as any}>
          &gt; {log}
        </Text>
      ))}
      <GlowingText blink size={14} style={{ marginTop: 4 }}>_</GlowingText>
    </HoloPanel>
  );
};

const RadarWidget = () => {
    const spinValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(spinValue, {
                toValue: 1,
                duration: 4000,
                easing: Easing.linear,
                useNativeDriver: true
            })
        ).start();
    }, []);

    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    return (
        <HoloPanel title="Local Scan" flex={1} style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View style={styles.radarContainer}>
                {/* Radar Rings */}
                <View style={[styles.radarRing, { width: 100, height: 100 }]} />
                <View style={[styles.radarRing, { width: 60, height: 60 }]} />
                <View style={[styles.radarRing, { width: 20, height: 20, backgroundColor: theme.neonPrimary }]} />

                {/* Sweeping Line */}
                <Animated.View style={[
                    styles.radarSweep,
                    { transform: [{ rotate: spin }] }
                ]}>
                    <View style={styles.radarSweepLine} />
                    <View style={styles.radarSweepGradient} />
                </Animated.View>

                {/* Random Blips */}
                <View style={[styles.radarBlip, { top: 20, left: 30 }] as any} />
                <View style={[styles.radarBlip, { top: 60, left: 80, backgroundColor: theme.neonAlert, boxShadow: `0px 0px 5px ${theme.neonAlert}` }] as any} />
            </View>
        </HoloPanel>
    );
};


// --- Main Application ---

export default function App() {
  const scanlineAnim = useRef(new Animated.Value(0)).current;
  const [isSecure, setIsSecure] = useState(true);

  // Scanline effect loop
  useEffect(() => {
    Animated.loop(
      Animated.timing(scanlineAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const scanlineTranslateY = scanlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, height + 100],
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Animated Scanline Overlay */}
      <Animated.View
        style={[
          styles.scanline,
          { transform: [{ translateY: scanlineTranslateY }] },
        ] as any}
      />

      {/* Grid Background Effect (Simulated with borders/spacing in layout) */}
      <View style={styles.gridOverlay} pointerEvents="none" />

      <ScrollView contentContainerStyle={styles.scrollContent} indicatorStyle="white">
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <GlowingText size={28} style={{ fontWeight: 'bold', letterSpacing: 4 }}>NEXUS // OS</GlowingText>
            <Text style={styles.mutedText}>V. 9.4.12 - ORBITAL STATION ZETA</Text>
          </View>
          <TouchableOpacity 
            style={[styles.statusBadge, { borderColor: isSecure ? theme.neonPrimary : theme.neonAlert }]}
            onPress={() => setIsSecure(!isSecure)}
          >
            <GlowingText blink color={isSecure ? theme.neonPrimary : theme.neonAlert} size={12}>
              {isSecure ? 'SECURE' : 'BREACH'}
            </GlowingText>
          </TouchableOpacity>
        </View>

        {/* Top Row Widgets */}
        <View style={styles.row}>
          <CpuWidget />
          <View style={{ width: 16 }} />
          <NetworkWidget />
        </View>

        {/* Middle Row Widgets */}
        <View style={[styles.row, { marginTop: 16 }]}>
            <RadarWidget />
             <View style={{ width: 16 }} />
             <HoloPanel title="Life Support" flex={1} borderColor={theme.neonAlert}>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <View style={styles.rowBetween}>
                        <Text style={styles.textMain}>O2 LEVEL</Text>
                        <GlowingText color={theme.neonAlert}>78%</GlowingText>
                    </View>
                    <View style={[styles.miniBar, { width: '78%', backgroundColor: theme.neonAlert, marginBottom: 16 }]} />
                    
                    <View style={styles.rowBetween}>
                        <Text style={styles.textMain}>TEMP</Text>
                        <GlowingText color={theme.neonPrimary}>22°C</GlowingText>
                    </View>
                    <View style={[styles.miniBar, { width: '50%', backgroundColor: theme.neonPrimary, marginBottom: 16 }]} />
                    
                    <View style={styles.rowBetween}>
                        <Text style={styles.textMain}>GRAV</Text>
                        <GlowingText color={theme.neonPrimary}>0.98G</GlowingText>
                    </View>
                    <View style={[styles.miniBar, { width: '98%', backgroundColor: theme.neonPrimary }]} />
                </View>
             </HoloPanel>
        </View>

        {/* Bottom Span Widget */}
        <View style={{ marginTop: 16 }}>
          <SystemLogWidget />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    overflow: 'hidden', // Keep scanline contained
  },
  scrollContent: {
    padding: 16,
    paddingTop: 40,
    paddingBottom: 60,
  },
  baseText: {
    fontFamily: 'Courier', // Monospace feel for react-native
    color: theme.textMain,
  },
  mutedText: {
    fontFamily: 'Courier',
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 1,
  },
  textMain: {
    fontFamily: 'Courier',
    color: theme.textMain,
    fontSize: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 243, 255, 0.2)',
    paddingBottom: 16,
  },
  statusBadge: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 243, 255, 0.05)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 180,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Panel Styles
  panel: {
    borderWidth: 1,
    backgroundColor: `rgba(0, 0, 0, 0.4)`,
    borderRadius: 4,
    padding: 12,
    position: 'relative',
    // Glow effect
    boxShadow: '0px 0px 10px rgba(0, 243, 255, 0.6)',
    elevation: 5,
  },
  panelHeader: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 4,
  },
  panelContent: {
    flex: 1,
  },
  panelCornerTopRight: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 10,
    height: 10,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  panelCornerBottomLeft: {
    position: 'absolute',
    bottom: -100, // Hacky, ideally based on layout, but fixed size panels make this ok-ish, wait let's use a better approach
    left: -12,
    width: 10,
    height: 10,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  // CPU Chart Styles
  chartContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingTop: 10,
  },
  barWrapper: {
    width: '6%',
    height: '100%',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.05)', // Background track
  },
  bar: {
    width: '100%',
    opacity: 0.8,
  },
  miniBar: {
    height: 4,
    marginTop: 4,
    borderRadius: 2,
    boxShadow: `0px 0px 5px ${theme.neonSecondary}`, // overridden inline usually
  },
  // Terminal Logs
  logText: {
    fontFamily: 'Courier',
    color: theme.textMain,
    fontSize: 11,
    lineHeight: 18,
  },
  // Radar Styles
  radarContainer: {
      width: 120,
      height: 120,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
  },
  radarRing: {
      position: 'absolute',
      borderRadius: 100,
      borderWidth: 1,
      borderColor: theme.neonPrimary,
      opacity: 0.3,
  },
  radarSweep: {
      position: 'absolute',
      width: 120,
      height: 120,
      alignItems: 'center',
      justifyContent: 'flex-start',
  },
  radarSweepLine: {
      width: 1,
      height: 60,
      backgroundColor: theme.neonPrimary,
      boxShadow: `0px 0px 10px ${theme.neonPrimary}`,
  },
  radarSweepGradient: {
      // Hard to do true sweep gradient in pure RN without SVG/LinearGradient, 
      // so we just rely on the spinning line for the effect.
  },
  radarBlip: {
      position: 'absolute',
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#fff',
      boxShadow: '0px 0px 5px #fff',
  },
  // Global Effects
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(0, 243, 255, 0.3)',
    boxShadow: `0px 0px 10px ${theme.neonPrimary}`,
    elevation: 10,
    zIndex: 100, // Put it over everything
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.05,
    // A simple trick for a rough grid using border styling on a big view could go here,
    // but the panel layout usually provides enough structural 'grid' feel.
  }
});
