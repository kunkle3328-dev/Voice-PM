import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Dimensions,
  Easing
} from 'react-native';
import { Mic, MicOff, PhoneOff, Settings, User, MoreHorizontal, Activity } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

type AIState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [aiState, setAiState] = useState<AIState>('idle');
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'ai', text: 'Hello! I am ready to chat. Tap the orb to begin.' }
  ]);

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const innerPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let pulseConfig: Animated.CompositeAnimation | null = null;
    let rotationConfig: Animated.CompositeAnimation | null = null;

    if (isActive) {
      if (aiState === 'listening') {
        pulseConfig = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.2,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        pulseConfig.start();
      } else if (aiState === 'thinking') {
        rotationConfig = Animated.loop(
          Animated.timing(rotationAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        );
        rotationConfig.start();
        
        pulseConfig = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.05,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 0.95,
              duration: 400,
              useNativeDriver: true,
            }),
          ])
        );
        pulseConfig.start();
      } else if (aiState === 'speaking') {
        pulseConfig = Animated.loop(
          Animated.sequence([
            Animated.timing(innerPulseAnim, {
              toValue: 1.4,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(innerPulseAnim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(innerPulseAnim, {
              toValue: 1.2,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(innerPulseAnim, {
              toValue: 1,
              duration: 250,
              useNativeDriver: true,
            }),
          ])
        );
        pulseConfig.start();
      }
    } else {
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      Animated.timing(innerPulseAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      rotationAnim.setValue(0);
    }

    return () => {
      if (pulseConfig) pulseConfig.stop();
      if (rotationConfig) rotationConfig.stop();
    };
  }, [isActive, aiState, pulseAnim, rotationAnim, innerPulseAnim]);

  const spin = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleOrbPress = () => {
    if (!isActive) {
      setIsActive(true);
      setAiState('listening');
      setMessages([{ id: Date.now().toString(), role: 'ai', text: 'Listening...' }]);
      
      // Simulate conversation flow
      setTimeout(() => {
        setAiState('thinking');
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: 'Tell me a joke about programming.' }]);
        
        setTimeout(() => {
          setAiState('speaking');
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: 'Why do programmers prefer dark mode? Because light attracts bugs!' }]);
          
          setTimeout(() => {
            setAiState('listening');
          }, 4000);
        }, 2000);
      }, 3000);
    } else {
      // Toggle states manually for demo purposes
      if (aiState === 'listening') setAiState('thinking');
      else if (aiState === 'thinking') setAiState('speaking');
      else setAiState('listening');
    }
  };

  const endCall = () => {
    setIsActive(false);
    setAiState('idle');
    setMessages([{ id: Date.now().toString(), role: 'ai', text: 'Session ended. Tap to restart.' }]);
  };

  const getOrbColors = () => {
    if (!isActive) return ['#333', '#111'];
    switch (aiState) {
      case 'listening': return ['#4facfe', '#00f2fe'];
      case 'thinking': return ['#a18cd1', '#fbc2eb'];
      case 'speaking': return ['#43e97b', '#38f9d7'];
      default: return ['#333', '#111'];
    }
  };

  const [color1, color2] = getOrbColors();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton}>
          <Settings color="#fff" size={24} />
        </TouchableOpacity>
        <View style={styles.statusBadge}>
          <Activity color={isActive ? "#4facfe" : "#888"} size={16} />
          <Text style={styles.statusText}>
            {isActive ? `${aiState.toUpperCase()}` : 'READY'}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconButton}>
          <User color="#fff" size={24} />
        </TouchableOpacity>
      </View>

      {/* Main Orb Area */}
      <View style={styles.orbContainer}>
        <TouchableOpacity activeOpacity={0.9} onPress={handleOrbPress} style={styles.orbWrapper}>
          <Animated.View
            style={[
              styles.orbOuter,
              {
                transform: [
                  { scale: pulseAnim },
                  { rotate: spin }
                ],
                backgroundColor: isActive && aiState === 'thinking' ? color2 : 'transparent',
                borderColor: color1,
                borderWidth: isActive && aiState === 'thinking' ? 0 : 2,
              }
            ]}
          >
            <Animated.View
              style={[
                styles.orbInner,
                {
                  transform: [{ scale: innerPulseAnim }],
                  backgroundColor: color1,
                  shadowColor: color1,
                }
              ]}
            />
          </Animated.View>
        </TouchableOpacity>
        
        {/* Current State Hint */}
        <Text style={styles.stateHint}>
          {isActive ? (aiState === 'listening' ? "Go ahead, I'm listening..." : aiState === 'thinking' ? "Processing..." : "Speaking...") : "Tap to connect to Genesis AI"}
        </Text>
      </View>

      {/* Transcript Area */}
      <View style={styles.transcriptContainer}>
        <ScrollView 
          contentContainerStyle={styles.transcriptScroll}
          showsVerticalScrollIndicator={false}
          ref={(ref) => ref?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg) => (
            <View 
              key={msg.id} 
              style={[
                styles.messageBubble, 
                msg.role === 'user' ? styles.messageUser : styles.messageAI
              ]}
            >
              <Text style={styles.messageText}>{msg.text}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Controls */}
      <View style={[styles.controls, { opacity: isActive ? 1 : 0.5 }]} pointerEvents={isActive ? 'auto' : 'none'}>
        <TouchableOpacity 
          style={[styles.controlButton, isMuted && styles.controlButtonActive]} 
          onPress={() => setIsMuted(!isMuted)}
        >
          {isMuted ? <MicOff color="#fff" size={28} /> : <Mic color="#fff" size={28} />}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.controlButton, styles.endCallButton]} onPress={endCall}>
          <PhoneOff color="#fff" size={28} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlButton}>
          <MoreHorizontal color="#fff" size={28} />
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  iconButton: {
    padding: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  orbContainer: {
    flex: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbWrapper: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  orbInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 10,
  },
  stateHint: {
    color: '#888',
    fontSize: 16,
    marginTop: 40,
    fontWeight: '500',
  },
  transcriptContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  transcriptScroll: {
    paddingBottom: 20,
    justifyContent: 'flex-end',
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
  },
  messageUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a1a1a',
    borderBottomRightRadius: 4,
  },
  messageAI: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a2a',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingBottom: 40,
    paddingTop: 20,
    backgroundColor: '#050505',
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#ff4444',
  },
  endCallButton: {
    backgroundColor: '#ff4444',
    width: 72,
    height: 72,
    borderRadius: 36,
  },
});
