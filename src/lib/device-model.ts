import axios, { type AxiosResponse } from 'axios'

const http = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    timeout: 15000,
})

http.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

http.interceptors.response.use(
    (res: AxiosResponse) => res.data,
    (error) => {
        if (error.response?.status === 401) {
            // 清除 token，跳转登录，或尝试 refresh
        }
        return Promise.reject(error)
    },
)

export default http