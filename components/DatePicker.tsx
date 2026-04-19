import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Modal,
} from 'react-native';
import { format } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS } from '@/lib/constants';
import FontAwesome from '@expo/vector-icons/FontAwesome';

interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  mode?: 'date' | 'time';
  placeholder?: string;
}

export function DatePicker({ value, onChange, mode = 'date', placeholder }: DatePickerProps) {
  const [show, setShow] = useState(false);
  const [tempValue, setTempValue] = useState<Date>(value || new Date());

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webWrapper}>
        <input
          type={mode}
          value={
            value
              ? mode === 'date'
                ? format(value, 'yyyy-MM-dd')
                : format(value, 'HH:mm')
              : ''
          }
          onChange={(e: any) => {
            const val = e.target.value;
            if (!val) return;
            if (mode === 'date') {
              onChange(new Date(val + 'T00:00:00'));
            } else {
              const [h, m] = val.split(':');
              const d = new Date();
              d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
              onChange(d);
            }
          }}
          style={{
            height: 48,
            border: '1.5px solid #e5e7eb',
            borderRadius: 12,
            backgroundColor: '#fafafa',
            paddingLeft: 16,
            paddingRight: 16,
            fontSize: 15,
            color: '#111',
            width: '100%',
            fontFamily: 'inherit',
          }}
        />
      </View>
    );
  }

  // iOS: Modal-based picker
  const handleOpen = () => {
    setTempValue(value || new Date());
    setShow(true);
  };

  const handleDone = () => {
    onChange(tempValue);
    setShow(false);
  };

  const handleCancel = () => {
    setShow(false);
  };

  const displayText = value
    ? mode === 'date'
      ? format(value, 'MMM d, yyyy')
      : format(value, 'h:mm a')
    : placeholder || (mode === 'date' ? 'Select date' : 'Select time');

  return (
    <View>
      <TouchableOpacity style={styles.button} onPress={handleOpen} activeOpacity={0.7}>
        <FontAwesome
          name={mode === 'date' ? 'calendar-o' : 'clock-o'}
          size={14}
          color={value ? COLORS.brand : COLORS.ink3}
        />
        <Text style={[styles.buttonText, !value && styles.placeholder]}>
          {displayText}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={show}
        transparent
        animationType="slide"
        onRequestClose={handleCancel}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={handleCancel}
        >
          <View style={styles.modalSheet}>
            {/* Toolbar */}
            <View style={styles.toolbar}>
              <TouchableOpacity onPress={handleCancel} hitSlop={12}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.toolbarTitle}>
                {mode === 'date' ? 'Select Date' : 'Select Time'}
              </Text>
              <TouchableOpacity onPress={handleDone} hitSlop={12}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Picker */}
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={tempValue}
                mode={mode}
                display="spinner"
                onChange={(_event: any, selectedDate?: Date) => {
                  if (selectedDate) setTempValue(selectedDate);
                }}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  webWrapper: { width: '100%' },
  button: {
    height: 48,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fafafa',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonText: { fontSize: 15, color: COLORS.ink },
  placeholder: { color: COLORS.ink3 },
  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
  },
  toolbarTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.ink,
  },
  cancelText: { fontSize: 15, color: COLORS.ink3, fontWeight: '600' },
  doneText: { fontSize: 15, color: COLORS.brand, fontWeight: '700' },
  pickerWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
