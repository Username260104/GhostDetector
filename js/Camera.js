export default class Camera {
    constructor(videoElement) {
        this.video = videoElement;
    }

    async start() {
        // 1. 초기 권한 요청 (장치 목록을 얻기 위함)
        try {
            const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
            // 권한 획득 후 스트림 정지 (디바이스 선택을 위해)
            initialStream.getTracks().forEach(track => track.stop());
        } catch (e) {
            console.warn("초기 권한 요청 실패:", e);
            // 권한이 없어도 진행은 시도 (브라우저 정책에 따라 다름)
        }

        // 2. 장치 목록 조회 및 광각(Wide) 카메라 검색
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        console.log("Available Cameras:", videoDevices);

        // 'wide', 'ultra', '0.5' 등의 키워드가 포함된 후면 카메라 찾기
        let targetDeviceId = null;
        const keywords = ['wide', 'ultra', '0.5x', '0.5', '광각', 'environment'];

        // 우선순위 1: 광각 키워드가 있는 후면 카메라
        const wideCamera = videoDevices.find(device => {
            const label = device.label.toLowerCase();
            return keywords.some(k => label.includes(k)) &&
                (label.includes('back') || label.includes('rear') || label.includes('후면'));
        });

        if (wideCamera) {
            console.log("Wide camera found:", wideCamera.label);
            targetDeviceId = wideCamera.deviceId;
        } else {
            // 우선순위 2: 그냥 후면 카메라
            const backCamera = videoDevices.find(device =>
                device.label.toLowerCase().includes('back') ||
                device.label.toLowerCase().includes('rear')
            );
            if (backCamera) {
                targetDeviceId = backCamera.deviceId;
            }
        }

        // 3. 최종 스트림 요청
        const constraints = {
            video: {
                deviceId: targetDeviceId ? { exact: targetDeviceId } : undefined,
                facingMode: targetDeviceId ? undefined : 'environment', // ID가 없으면 facingMode 사용
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.video.srcObject = stream;

        return new Promise((resolve) => {
            this.video.onloadedmetadata = () => {
                this.video.play();
                resolve();
            };
        });
    }
}
