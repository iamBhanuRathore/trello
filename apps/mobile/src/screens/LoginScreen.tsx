import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useMobileAuthStore } from '../store/authStore';
import { login, registerPushToken } from '../lib/api';

export function LoginScreen({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [email, setEmail] = useState('demo@boardly.com');
  const [password, setPassword] = useState('password123');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const setAuth = useMobileAuthStore((s) => s.setAuth);

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const data = await login(email.trim(), password);
      setAuth(data.user, data.accessToken);

      // Register device for push notifications
      try {
        await registerPushToken({
          platform: 'ios',
          token: `mobile_dev_${Date.now()}`,
          deviceName: 'Mobile Simulator',
        });
      } catch (pushErr) {
        console.warn('Push registration skipped:', pushErr);
      }

      onLoginSuccess();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || 'Invalid credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.brandContainer}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>B</Text>
        </View>
        <Text style={styles.title}>Boardly Mobile</Text>
        <Text style={styles.subtitle}>Enterprise Project &amp; Kanban Collaboration</Text>
      </View>

      <View style={styles.formContainer}>
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Work Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.com"
            placeholderTextColor="#71717a"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#71717a"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    padding: 24,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fafafa',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#a1a1aa',
    marginTop: 4,
  },
  formContainer: {
    backgroundColor: '#18181b',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d4d4d8',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    height: 46,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#fafafa',
  },
  button: {
    height: 48,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  errorBox: {
    padding: 12,
    backgroundColor: '#3f1519',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e11d48',
    marginBottom: 16,
  },
  errorText: {
    color: '#fb7185',
    fontSize: 12,
  },
});
