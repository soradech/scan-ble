import { Buffer } from 'buffer'; // Run: npm install buffer
import { useEffect, useState } from 'react';
import { Button, FlatList, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

const manager = new BleManager();

// Replace these with your target device's UUIDs
const SERVICE_UUID = '0x180F' //'12345678-1234-5678-1234-567812345678';
const CHAR_UUID_READ = '87654321-4321-4321-4321-210987654321';
const CHAR_UUID_WRITE = 'abcdef01-abcd-abcd-abcd-abcdef012345';
const CHAR_UUID_NOTIFY = 'fedcba98-fedc-fedc-fedc-fedcba987654';

export default function Index() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [receivedData, setReceivedData] = useState<string>('');

  async function requestPermissions() {
    manager.stopDeviceScan();
    if (Platform.OS === 'android') {
      // Android 12+ permissions
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        // Android 11 or lower
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true; // iOS handles this via Info.plist when the scan starts
  }

  useEffect(() => {
    requestPermissions().then((granted) => {
      if (!granted) {
        console.log('Bluetooth permissions not granted');
      }
    });
  }, []);



  // 1. Scan for Peripherals
  const startScan = () => {
    setDevices([]);
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log('Scan error:', error);
        return;
      }
      if (device && device.name) {
        setDevices((prevDevices) => {
          if (prevDevices.some((d) => d.id === device.id)) return prevDevices;
          return [...prevDevices, device];
        });
      }
    });
  };

  // 2. Connect to a Device
  const connectToDevice = async (device: Device) => {
    manager.stopDeviceScan();
    try {
      const connected = await manager.connectToDevice(device.id);
      // Crucial Step: Discover services and characteristics before interacting
      const discovered = await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(discovered);
      console.log('Connected to:', discovered.name);
    } catch (error) {
      console.log('Connection failed:', error);
    }
  };

  // 3. READ Mode (Synchronous Pull)
  const readCharacteristic = async () => {
    if (!connectedDevice) return;
    try {
      const char = await manager.readCharacteristicForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID_READ
      );
      // Decode Base64 string back to readable text/numbers
      const rawData = Buffer.from(char.value || '', 'base64').toString('ascii');
      setReceivedData(`Read Value: ${rawData}`);
    } catch (error) {
      console.log('Read failed:', error);
    }
  };

  // 4. WRITE Mode (Push Data)
  const writeCharacteristic = async () => {
    if (!connectedDevice) return;
    try {
      // Data MUST be converted to Base64
      const base64Value = Buffer.from('Hello BLE').toString('base64');
      
      // Use writeCharacteristicWithResponseForDevice for Write Request
      // Use writeCharacteristicWithoutResponseForDevice for Write Command
      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID_WRITE,
        base64Value
      );
      console.log('Write Success!');
    } catch (error) {
      console.log('Write failed:', error);
    }
  };

  // 5. NOTIFY / INDICATE Mode (Asynchronous Push Subscriptions)
  const startNotificationStream = () => {
    if (!connectedDevice) return;

    // monitorCharacteristicForDevice handles both Notifications and Indications
    manager.monitorCharacteristicForDevice(
      connectedDevice.id,
      SERVICE_UUID,
      CHAR_UUID_NOTIFY,
      (error, char) => {
        if (error) {
          console.log('Notification error:', error);
          return;
        }
        if (char?.value) {
          const rawData = Buffer.from(char.value, 'base64').toString('ascii');
          setReceivedData(`Live Stream: ${rawData}`);
        }
      }
    );
  };

  // Clean up connections on unmount
  //useEffect(() => {
  //  return () => {
  //    manager.stopDeviceScan();
  //  };
  //}, []);

  return (
    <View style={styles.container}>
      {!connectedDevice ? (
        <>
          <Button title="Scan Devices" onPress={startScan} />
          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.deviceRow} onPress={() => connectToDevice(item)}>
                <Text>{item.name} - ({item.id} - {item.rssi ? `${item.rssi} dBm` : 'Unknown RSSI'})</Text>
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <View style={styles.dashboard}>
          <Text style={styles.title}>Connected to: {connectedDevice.name}</Text>
          <Text style={styles.dataBox}>{receivedData || "No data fetched yet"}</Text>
          
          <Button title="Read Value" onPress={readCharacteristic} />
          <Button title="Write 'Hello BLE'" onPress={writeCharacteristic} />
          <Button title="Subscribe to Notifications" onPress={startNotificationStream} />
          <Button title="Disconnect" onPress={() => {
            manager.cancelDeviceConnection(connectedDevice.id);
            setConnectedDevice(null);
          }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 20, backgroundColor: '#fff' },
  deviceRow: { padding: 15, marginVertical: 5, backgroundColor: '#f0f0f0', borderRadius: 5 },
  dashboard: { gap: 15 },
  title: { fontSize: 18, fontWeight: 'bold' },
  dataBox: { padding: 20, backgroundColor: '#eef', marginVertical: 10, textAlign: 'center' }
});

