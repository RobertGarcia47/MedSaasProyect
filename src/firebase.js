import { initializeApp } from 'firebase/app'
import { getAnalytics } from 'firebase/analytics'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: 'AIzaSyBBY3HI0o2CzjflHSVQshyzXDuu6wVNcAY',
  authDomain: 'medsaasr.firebaseapp.com',
  projectId: 'medsaasr',
  storageBucket: 'medsaasr.firebasestorage.app',
  messagingSenderId: '662892773701',
  appId: '1:662892773701:web:50b0880c5567a8b7727e2c',
  measurementId: 'G-LTBLX850QX',
}

const app = initializeApp(firebaseConfig)

export const analytics = getAnalytics(app)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

export default app
