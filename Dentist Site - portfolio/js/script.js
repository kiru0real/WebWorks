/* Smooth Scroll & Animations */
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                const navHeight = document.querySelector('nav').offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - navHeight - 10;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    const elements = document.querySelectorAll('.animate-on-scroll:not(.visible)');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -30px 0px'
    });
    elements.forEach(el => observer.observe(el));

    /* Phone Mask */
    const phoneInput = document.getElementById('phoneInput');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            let value = this.value.replace(/\D/g, '');
            if (value.length > 11) value = value.slice(0, 11);
            let formatted = '';
            if (value.length > 0) {
                formatted = '+7';
                if (value.length > 1) {
                    formatted += ' (' + value.substring(1, 4);
                }
                if (value.length >= 5) {
                    formatted += ') ' + value.substring(4, 7);
                }
                if (value.length >= 8) {
                    formatted += '-' + value.substring(7, 9);
                }
                if (value.length >= 10) {
                    formatted += '-' + value.substring(9, 11);
                }
            }
            this.value = formatted;
        });
    }

    /* Form Submit */
    const form = document.getElementById('appointmentForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const name = this.querySelector('input[placeholder="Ваше имя *"]');
            const phone = document.getElementById('phoneInput');
            const service = this.querySelector('select');
            if (name.value.trim() === '' || phone.value.trim() === '' || service.value === '') {
                alert('Пожалуйста, заполните имя, телефон и выберите услугу.');
                return;
            }
            alert('✅ Спасибо! Ваша заявка принята. Мы свяжемся с вами в ближайшее время.');
            this.reset();
        });
    }

    /* Yandex Map */
    if (typeof ymaps !== 'undefined') {
        ymaps.ready(function() {
            const mapElement = document.getElementById('map');
            if (mapElement) {
                const myMap = new ymaps.Map('map', {
                    center: [55.755819, 37.617644],
                    zoom: 16,
                    controls: ['zoomControl', 'fullscreenControl']
                });

                const placemark = new ymaps.Placemark([55.755819, 37.617644], {
                    balloonContent: '<strong>CleanSmile</strong><br>Москва, ул. Центральная, д. 10<br>+7 (495) 123-45-67'
                }, {
                    preset: 'islands#blueCircleIcon',
                    iconColor: '#1a6b9e'
                });

                myMap.geoObjects.add(placemark);
            }
        });
    }
});